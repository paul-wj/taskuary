"""Skill discovery failure cannot end the existing report scheduler."""
from types import SimpleNamespace
import pytest
from taskuary import server
import taskuary


def test_skill_discovery_failure_does_not_stop_existing_report_clock(monkeypatch):
    seen = {'report': 0, 'advice': 0, 'skill': 0, 'sleeps': 0}
    class StopClock(Exception): pass
    def pause(_):
        seen['sleeps'] += 1
        if seen['sleeps'] > 1: raise StopClock()
    def report(): seen['report'] += 1
    def advice(): seen['advice'] += 1
    def broken_tick(store):
        seen['skill'] += 1
        raise RuntimeError('fictional provider unavailable')
    monkeypatch.setattr(server.time, 'sleep', pause)
    monkeypatch.setattr(server, 'report_pass', report)
    monkeypatch.setattr(server, 'advisor_pass', advice)
    monkeypatch.setattr(taskuary, 'skilldiscovery', SimpleNamespace(tick=broken_tick), raising=False)
    with pytest.raises(StopClock): server.reports_forever()
    assert seen['report'] == 1 and seen['advice'] == 1
    assert seen['skill'] == 1
    assert seen['sleeps'] == 2
