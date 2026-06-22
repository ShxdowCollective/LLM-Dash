"""Tests for the streamed-agent log narration helpers (no network/model calls)."""

from __future__ import annotations

import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from scripts.run_update import _classify_tool, _consume_agent_stream, _summarize_tool_arg


def _tool_event(name: str, arguments: str = "") -> SimpleNamespace:
    raw = SimpleNamespace(name=name, arguments=arguments)
    item = SimpleNamespace(raw_item=raw, title=name)
    return SimpleNamespace(type="run_item_stream_event", name="tool_called", item=item)


class _FakeStream:
    """Mimics RunResultStreaming.stream_events(): an async iterator over events.
    If `raise_after` is set, raises that exception once that many events emit."""

    def __init__(self, events, raise_after=None, exc=None):
        self._events = events
        self._raise_after = raise_after
        self._exc = exc

    def stream_events(self):
        async def _gen():
            for idx, event in enumerate(self._events):
                if self._raise_after is not None and idx == self._raise_after:
                    raise self._exc
                yield event
            if self._raise_after is not None and self._raise_after >= len(self._events):
                raise self._exc

        return _gen()


class ClassifyToolTests(unittest.TestCase):
    def test_search_fetch_other(self):
        self.assertEqual(_classify_tool("web_search_exa"), "search")
        self.assertEqual(_classify_tool("get_contents"), "fetch")
        self.assertEqual(_classify_tool("crawling"), "fetch")
        self.assertEqual(_classify_tool("some_other_tool"), "other")


class SummarizeToolArgTests(unittest.TestCase):
    def test_pulls_query(self):
        raw = SimpleNamespace(arguments=json.dumps({"query": "latest LLM releases"}))
        self.assertEqual(_summarize_tool_arg(raw), "latest LLM releases")

    def test_truncates(self):
        raw = SimpleNamespace(arguments=json.dumps({"url": "x" * 200}))
        self.assertEqual(len(_summarize_tool_arg(raw)), 80)

    def test_non_json_string(self):
        raw = SimpleNamespace(arguments="not json " * 20)
        self.assertEqual(len(_summarize_tool_arg(raw)), 80)

    def test_missing_args(self):
        self.assertEqual(_summarize_tool_arg(SimpleNamespace()), "")
        self.assertEqual(_summarize_tool_arg(SimpleNamespace(arguments=None)), "")


class ConsumeStreamTests(unittest.TestCase):
    def test_logs_tool_calls_and_summary(self):
        events = [
            _tool_event("web_search_exa", json.dumps({"query": "gpt-6"})),
            _tool_event("get_contents", json.dumps({"url": "https://example.com"})),
            _tool_event("web_search_exa", json.dumps({"query": "claude opus"})),
        ]
        with tempfile.TemporaryDirectory() as tmp:
            log_path = Path(tmp) / "job.log"
            counts = asyncio.run(_consume_agent_stream(_FakeStream(events), log_path))
            self.assertEqual(counts, {"calls": 3, "searches": 2, "fetches": 1})
            text = log_path.read_text(encoding="utf-8")
            self.assertEqual(text.count("agent_tool_call "), 3)
            self.assertIn('"kind": "search"', text)
            self.assertIn("agent_tool_summary ", text)
            self.assertIn('"searches": 2', text)

    def test_exception_propagates_and_is_not_swallowed(self):
        # A MaxTurnsExceeded-class failure surfaces from the stream iterator and
        # must reach the caller (which owns retry/fallback), not be swallowed by
        # the per-event logging guard. One event logs before the raise.
        class StreamBoom(RuntimeError):
            pass

        events = [_tool_event("web_search_exa", json.dumps({"query": "x"}))]
        with tempfile.TemporaryDirectory() as tmp:
            log_path = Path(tmp) / "job.log"
            stream = _FakeStream(events, raise_after=1, exc=StreamBoom("max turns"))
            with self.assertRaises(StreamBoom):
                asyncio.run(_consume_agent_stream(stream, log_path))
            text = log_path.read_text(encoding="utf-8")
            self.assertEqual(text.count("agent_tool_call "), 1)
            self.assertNotIn("agent_tool_summary ", text)
            self.assertNotIn("agent_stream_log_error", text)


if __name__ == "__main__":
    unittest.main()
