"""Model picks come from the CLI's own files: codex's models_cache.json and config.toml."""
import json, tempfile, unittest
from pathlib import Path
from unittest import mock
import pytest
from taskuary import climodels, clis, llm
from taskuary.store import MemoryStore

CACHE = {'models': [
    {'slug': 'gpt-5.6-sol', 'display_name': 'GPT-5.6-Sol', 'description': 'Latest frontier agentic coding model.', 'priority': 1, 'visibility': 'list',
     'default_reasoning_level': 'low', 'supported_reasoning_levels': [{'effort': 'low'}, {'effort': 'medium'}, {'effort': 'high'}, {'effort': 'xhigh'}]},
    {'slug': 'gpt-reserve', 'display_name': 'GPT-Reserve', 'priority': 2, 'visibility': 'hide', 'supported_reasoning_levels': [{'effort': 'high'}]},
    {'slug': 'gpt-5.4-mini', 'display_name': 'GPT-5.4-Mini', 'priority': 5, 'visibility': 'list', 'default_reasoning_level': 'medium',
     'supported_reasoning_levels': [{'effort': 'low'}, {'effort': 'medium'}]}]}


@pytest.mark.usefixtures('real_omp_catalog')
class CatalogTests(unittest.TestCase):
    def test_omp_catalog_uses_qualified_live_selectors_and_never_exposes_extra_fields(self):
        response = {'models': [
            {'provider': 'synthetic', 'kind': 'chat', 'id': 'fast-chat', 'selector': 'synthetic/fast-chat',
             'name': 'Fast Chat', 'contextWindow': 128000, 'maxTokens': 8192, 'reasoning': False,
             'thinking': None, 'input': ['text'], 'cost': {'input': 0, 'output': 0, 'cacheRead': 0, 'cacheWrite': 0},
             'pricingStatus': 'unknown', 'apiKey': 'private-key'},
            {'provider': 'other', 'kind': 'chat', 'id': 'fast-chat', 'selector': 'other/fast-chat',
             'name': 'Fast Chat', 'contextWindow': 128000, 'maxTokens': 8192, 'reasoning': False,
             'thinking': None, 'input': ['text'], 'cost': {'input': 0, 'output': 0, 'cacheRead': 0, 'cacheWrite': 0},
             'pricingStatus': 'unknown'}]}
        with mock.patch('taskuary.agents.pathcache.which', return_value='/custom/omp'), \
             mock.patch('taskuary.spawn.run', return_value=mock.Mock(returncode=0, stdout=json.dumps(response))) as run:
            cat = climodels.catalog('omp', cmd='/custom/omp')
        self.assertEqual(cat['choices'], ['synthetic/fast-chat', 'other/fast-chat'])
        self.assertEqual([m['label'] for m in cat['models']], ['Fast Chat · synthetic', 'Fast Chat · other'])
        self.assertNotIn('private-key', json.dumps(cat))
        self.assertEqual(run.call_args.args[0], ['/custom/omp', 'models', '--json', '--no-extensions'])

    def test_omp_catalog_failure_and_malformed_records_are_empty_not_invented(self):
        for result in [mock.Mock(returncode=1, stdout='{"models": []}'),
                       mock.Mock(returncode=0, stdout='not json'),
                       mock.Mock(returncode=0, stdout='{"models":[null, {"id":"missing-selector"}]}')]:
            with mock.patch('taskuary.agents.pathcache.which', return_value='/custom/omp'), \
                 mock.patch('taskuary.spawn.run', return_value=result):
                self.assertEqual(climodels.catalog('omp', cmd='/custom/omp')['choices'], [])
        with mock.patch('taskuary.agents.pathcache.which', return_value='/custom/omp'), \
             mock.patch('taskuary.spawn.run', side_effect=RuntimeError('spawn refused')):
            self.assertEqual(climodels.catalog('omp', cmd='/custom/omp')['choices'], [])

    def test_omp_catalog_refreshes_after_provider_changes(self):
        responses = [mock.Mock(returncode=0, stdout=json.dumps({'models': [{'selector': selector, 'name': 'Chat'}]}))
                     for selector in ('synthetic/one', 'synthetic/two')]
        with mock.patch('taskuary.agents.pathcache.which', return_value='/custom/omp'), \
             mock.patch('taskuary.spawn.run', side_effect=responses):
            self.assertEqual(climodels.catalog('omp', cmd='/custom/omp')['choices'], ['synthetic/one'])
            self.assertEqual(climodels.catalog('omp', cmd='/custom/omp')['choices'], ['synthetic/two'])
    def test_omp_catalog_resolves_a_bare_windows_command_on_fresh_path(self):
        response = mock.Mock(returncode=0, stdout=json.dumps({'models': [{'selector': 'synthetic/chat', 'name': 'Chat'}]}))
        with mock.patch('taskuary.agents.pathcache.which', return_value='C:/tools/omp.exe'), \
             mock.patch('taskuary.spawn.run', return_value=response) as run:
            cat = climodels.catalog('omp', cmd='omp.exe')
        self.assertEqual(cat['choices'], ['synthetic/chat'])
        self.assertEqual(run.call_args.args[0][0], 'C:/tools/omp.exe')
    def test_omp_catalog_uses_fresh_path_shim_target(self):
        response = mock.Mock(returncode=0, stdout=json.dumps({'models': [{'selector': 'synthetic/chat', 'name': 'Chat'}]}))
        def find(name, path=None):
            return 'C:/fresh/omp.cmd' if name == 'omp.cmd' and path == 'fresh-path' else None
        with mock.patch('taskuary.agents.pathcache.which', side_effect=find), \
             mock.patch('taskuary.agents._fresh_path', return_value='fresh-path'), \
             mock.patch('taskuary.agents.os.name', 'nt'), \
             mock.patch('taskuary.agents._shim_target', return_value=['C:/node/node.exe', 'C:/fresh/omp.js']), \
             mock.patch('taskuary.spawn.run', return_value=response) as run:
            cat = climodels.catalog('omp', cmd='omp.cmd')
        self.assertEqual(cat['choices'], ['synthetic/chat'])
        self.assertEqual(run.call_args.args[0], ['C:/node/node.exe', 'C:/fresh/omp.js', 'models', '--json', '--no-extensions'])

    def test_omp_catalog_does_not_run_when_explicit_executable_is_missing(self):
        with mock.patch('taskuary.agents.pathcache.which', return_value=None), \
             mock.patch('taskuary.agents._fresh_path', return_value='fresh-path'), \
             mock.patch('taskuary.spawn.run') as run:
            cat = climodels.catalog('omp', cmd='C:/missing/omp.exe')
        self.assertEqual(cat['choices'], [])
        run.assert_not_called()



    def test_codex_models_are_read_off_its_cache_visible_ones_by_priority(self):
        with tempfile.TemporaryDirectory() as d:
            Path(d, 'models_cache.json').write_text(json.dumps(CACHE), encoding='utf-8')
            Path(d, 'config.toml').write_text('model = "gpt-5.6-sol"\nmodel_reasoning_effort = "high"\n', encoding='utf-8')
            with mock.patch.dict('os.environ', {'CODEX_HOME': d}):
                cat = climodels.catalog('codex')
        self.assertEqual([m['id'] for m in cat['models']], ['gpt-5.6-sol', 'gpt-5.4-mini'])           # hidden ones stay hidden
        self.assertEqual(cat['models'][0]['efforts'], ['low', 'medium', 'high', 'xhigh']); self.assertEqual(cat['models'][0]['default_effort'], 'low')
        self.assertEqual(cat['current'], {'model': 'gpt-5.6-sol', 'effort': 'high'}); self.assertIn('models_cache', cat['source'])
        self.assertEqual(cat['choices'], ['gpt-5.6-sol', 'gpt-5.4-mini'])

    def test_no_cache_falls_back_to_the_stable_aliases(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.dict('os.environ', {'CODEX_HOME': d, 'CLAUDE_CONFIG_DIR': d}):
            cat = climodels.catalog('codex')
            claude = climodels.catalog('claude')
        self.assertEqual(cat['source'], 'built-in'); self.assertTrue(cat['models'])
        # a machine where claude has never run still offers something that works: the aliases
        self.assertEqual(claude['choices'], ['opus', 'sonnet', 'haiku']); self.assertEqual(claude['source'], 'built-in')
        self.assertEqual(climodels.split_pick('gpt-5.4-mini@low'), ('gpt-5.4-mini', 'low')); self.assertEqual(climodels.split_pick('opus'), ('opus', ''))

    def test_claude_models_are_read_off_its_own_catalog_newest_fetch_wins(self):
        old = {'fetchedAt': 100, 'catalog': {'config': {'models': [{'id': 'claude-was-current', 'name': 'Was Current'}]}}}
        new = {'fetchedAt': 200, 'catalog': {'config': {'models': [
            {'id': 'claude-opus-5', 'name': 'Opus 5', 'description': 'For complex tasks',
             'thinking': {'effort_options': [{'id': 'low'}, {'id': 'max'}]}},
            {'id': 'claude-sonnet-5', 'name': 'Sonnet 5'}]}}}
        with tempfile.TemporaryDirectory() as d:
            cache = Path(d, 'cache', 'model-catalog'); cache.mkdir(parents=True)
            # sorted() puts the stale file last: the newest fetchedAt has to win on its own merit
            Path(cache, 'zzz-old-cc.json').write_text(json.dumps(old), encoding='utf-8')
            Path(cache, 'aaa-new-cc.json').write_text(json.dumps(new), encoding='utf-8')
            Path(d, '.claude.json').write_text(json.dumps(
                {'additionalModelOptionsCache': [{'value': 'claude-opus-5[1m]', 'label': 'Opus', 'description': '1M context'}]}), encoding='utf-8')
            with mock.patch.dict('os.environ', {'CLAUDE_CONFIG_DIR': d}):
                cat = climodels.catalog('claude')
        # the account's granted extras ride along with the catalog, and the friendly name is the label
        self.assertEqual(cat['choices'], ['claude-opus-5', 'claude-sonnet-5', 'claude-opus-5[1m]'])
        self.assertEqual(cat['models'][0]['label'], 'Opus 5'); self.assertEqual(cat['source'], 'claude model catalog')
        # claude's own levels, as its catalog lists them - Claude Code takes `--effort <level>` (effort_args)
        self.assertEqual(cat['models'][0]['efforts'], ['low', 'max']); self.assertEqual(cat['models'][1]['efforts'], [])

    def test_an_unreadable_claude_catalog_does_not_take_the_picker_down(self):
        with tempfile.TemporaryDirectory() as d:
            cache = Path(d, 'cache', 'model-catalog'); cache.mkdir(parents=True)
            Path(cache, 'broken-cc.json').write_bytes(b'{not json at all')
            with mock.patch.dict('os.environ', {'CLAUDE_CONFIG_DIR': d}):
                self.assertEqual(climodels.catalog('claude')['choices'], ['opus', 'sonnet', 'haiku'])

    def test_copilot_models_come_from_the_installed_sdks_visible_choices(self):
        declaration = ('export declare const HELP_VISIBLE_MODELS: '
                       '("gpt-5.4" | "claude-sonnet-4.6" | "gpt-5.4")[];')
        got = climodels.parse_copilot_models(declaration)
        self.assertEqual([m['id'] for m in got], ['auto', 'gpt-5.4', 'claude-sonnet-4.6'])

    def test_devin_catalog_uses_model_families_not_hundreds_of_reasoning_variants(self):
        listing = """Available models (2 families)

Claude Opus 5 (claude-opus-5)
  aliases: opus
  claude-opus-5-low     Claude Opus 5 Low
GPT-5.6 Sol (gpt-5.6-sol)
  gpt-5-6-sol-medium    GPT-5.6 Sol Medium
"""
        got = climodels.parse_devin_models(listing)
        self.assertEqual([(m['id'], m['label']) for m in got],
                         [('claude-opus-5', 'Claude Opus 5'), ('gpt-5.6-sol', 'GPT-5.6 Sol')])

    def test_copilot_and_devin_are_real_model_catalogues_not_empty_placeholders(self):
        with mock.patch.object(climodels, 'copilot_models', return_value=climodels._items(['auto', 'gpt-5.4'])), \
             mock.patch.object(climodels, 'devin_models', return_value=climodels.parse_devin_models('SWE-2 (swe-2)')):
            self.assertEqual(climodels.catalog('copilot')['choices'], ['auto', 'gpt-5.4'])
            self.assertEqual(climodels.catalog('devin')['choices'], ['swe-2'])

    def test_every_shipped_cli_has_a_provider_specific_model_picker(self):
        with mock.patch.object(climodels, 'devin_models', return_value=climodels._items(['adaptive'])), \
             mock.patch.object(climodels, 'copilot_models', return_value=climodels._items(['auto'])), \
             mock.patch.object(climodels, 'omp_models', return_value=climodels._items(['synthetic/chat'])):
            missing = [row['name'] for row in clis.KNOWN if not climodels.catalog(row['name'])['choices']]
        self.assertEqual(missing, [])

    def test_chinese_cli_fallbacks_use_their_own_identifier_formats(self):
        with mock.patch.object(climodels, '_configured_models', return_value=([], {}, '')):
            self.assertEqual(climodels.catalog('qwen')['choices'], ['coder-model'])
            self.assertIn('kimi-code/kimi-for-coding', climodels.catalog('kimi')['choices'])
        self.assertIn('deepseek/deepseek-v4-pro', climodels.catalog('opencode')['choices'])
        self.assertIn('minimax/MiniMax-M3', climodels.catalog('opencode')['choices'])
        for name in ('qwen', 'kimi', 'opencode'):
            for model in climodels.STATIC[name]:
                self.assertTrue(model['id'])
                self.assertEqual(model['efforts'], [])  # do not send Codex's -c to another CLI

    def test_qwen_picker_reads_the_active_protocols_configured_ids(self):
        data = {'security': {'auth': {'selectedType': 'openai'}},
                'model': {'name': 'local-coder'}, 'modelProviders': {
                    'openai': [{'id': 'local-coder', 'name': 'Local coder', 'apiKey': 'private-key'}],
                    'anthropic': [{'id': 'different-provider-model'}]}}
        with tempfile.TemporaryDirectory() as d, mock.patch.dict('os.environ', {'QWEN_HOME': d}):
            Path(d, 'settings.json').write_text(json.dumps(data), encoding='utf-8')
            cat = climodels.catalog('qwen')
        self.assertEqual(cat['choices'], ['local-coder'])
        self.assertEqual(cat['current'], {'model': 'local-coder'})
        self.assertEqual(cat['models'][0]['label'], 'Local coder')
        self.assertNotIn('private-key', json.dumps(cat))

    def test_qwen_oauth_does_not_offer_ids_from_an_old_api_configuration(self):
        data = {'security': {'auth': {'selectedType': 'qwen-oauth'}}, 'model': {'name': 'old-api-model'}}
        with tempfile.TemporaryDirectory() as d, mock.patch.dict('os.environ', {'QWEN_HOME': d}):
            Path(d, 'settings.json').write_text(json.dumps(data), encoding='utf-8')
            self.assertEqual(climodels.catalog('qwen')['choices'], ['coder-model'])

    def test_kimi_picker_uses_aliases_and_updates_after_login_without_restart(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.dict('os.environ', {'KIMI_CODE_HOME': d}):
            self.assertIn('kimi-code/k3', climodels.catalog('kimi')['choices'])
            Path(d, 'config.toml').write_text(
                'default_model = "my-coder"\n[models.my-coder]\nprovider = "local"\n'
                'model = "raw-api-id"\ndisplay_name = "My coder"\n'
                '[providers.local]\napi_key = "private-key"\n', encoding='utf-8')
            cat = climodels.catalog('kimi')
        self.assertEqual(cat['choices'], ['my-coder'])
        self.assertEqual(cat['current'], {'model': 'my-coder'})
        self.assertNotIn('raw-api-id', json.dumps(cat))
        self.assertNotIn('private-key', json.dumps(cat))

    def test_unreadable_or_malformed_cli_config_keeps_documented_fallbacks(self):
        for name, env, filename in [('qwen', 'QWEN_HOME', 'settings.json'), ('kimi', 'KIMI_CODE_HOME', 'config.toml')]:
            with tempfile.TemporaryDirectory() as d, mock.patch.dict('os.environ', {env: d}):
                Path(d, filename).write_text('invalid{', encoding='utf-8')
                cat = climodels.catalog(name)
                self.assertEqual(cat['models'], climodels.STATIC[name])

    def test_a_model_at_effort_pick_becomes_model_plus_reasoning_flag(self):
        s = MemoryStore()
        s.upsert_agent('codex', 'coding', 'cli', json.dumps({'cmd': 'codex', 'args': ['exec'], 'light_model': 'gpt-5.4-mini@low'}))
        seen = {}
        with mock.patch('taskuary.agents.run_cli', side_effect=lambda prof, p, t, **kw: (seen.update(prof), ('{}', None, None))[1]):
            llm.make_cli_llm(s, 'codex')('sys', 'user')
        self.assertEqual(seen['model'], 'gpt-5.4-mini@low')      # run_cli spells the effort in this CLI's own flag
        # and the main model pick on a run does the same
        from taskuary.agents import run_cli
        with mock.patch('taskuary.agents._resolve_cmd', return_value=['X']), \
             mock.patch('taskuary.spawn.popen', side_effect=RuntimeError('stop')) as pop:
            with self.assertRaises(RuntimeError): run_cli({'cmd': 'codex', 'args': ['exec'], 'model': 'gpt-5.6-sol@xhigh'}, 'hi', lambda *a: None)
        argv = pop.call_args[0][0]
        self.assertEqual(argv[argv.index('--model') + 1], 'gpt-5.6-sol'); self.assertIn('model_reasoning_effort=xhigh', argv)


class EffortFlagTests(unittest.TestCase):
    """2026-09-25: "change assistant to effort level of low so it goes faster" - every Assistant turn ran on sonnet's
    default HIGH, because claude got no effort at all and codex's flag was the only one ever written."""

    def _argv(self, prof):
        from taskuary.agents import run_cli
        with mock.patch('taskuary.agents._resolve_cmd', return_value=['X']),              mock.patch('taskuary.spawn.popen', side_effect=RuntimeError('stop')) as pop:
            with self.assertRaises(RuntimeError): run_cli(prof, 'hi', lambda *a: None)
        return pop.call_args[0][0]

    def test_each_cli_gets_its_own_spelling(self):
        self.assertEqual(climodels.effort_args('claude', 'low'), ['--effort', 'low'])
        self.assertEqual(climodels.effort_args('codex', 'low'), ['-c', 'model_reasoning_effort=low'])
        self.assertEqual(climodels.effort_args('gemini', 'low'), [])
        argv = self._argv({'cmd': 'claude', 'args': ['-p'], 'model': 'claude-sonnet-5@low'})
        self.assertEqual(argv[argv.index('--model') + 1], 'claude-sonnet-5'); self.assertEqual(argv[argv.index('--effort') + 1], 'low')
        self.assertNotIn('model_reasoning_effort=low', argv)

    def test_the_assistant_runs_low_unless_its_pick_names_an_effort(self):
        from taskuary import concierge
        s = MemoryStore()
        s.upsert_agent('coding', 'coding', 'cli', json.dumps({'cmd': 'claude', 'args': ['-p']}))
        s.set_setting('concierge_ai', 'cli:claude', 't')
        seen = []
        with mock.patch('taskuary.llm.make_cli_llm', side_effect=lambda st, name, model, **kw: seen.append(model)):
            s.set_setting('concierge_model', 'claude-sonnet-5', 't'); concierge.brain(s, fast=True)
            s.set_setting('concierge_model', 'claude-sonnet-5@high', 't'); concierge.brain(s, fast=True)
        self.assertEqual(seen, ['claude-sonnet-5@low', 'claude-sonnet-5@high'])
