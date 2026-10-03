import unittest
from pydantic import ValidationError
from backend.chat import ChatService, checked_answer
from backend.contracts import ChatRequest


class LanguageTests(unittest.TestCase):
    def test_language_is_explicit_and_backwards_compatible(self):
        self.assertEqual(ChatRequest(message="Explain").language, "en")
        self.assertEqual(ChatRequest(message="समझाएँ", language="hi").language, "hi")
        with self.assertRaises(ValidationError):
            ChatRequest(message="Explain", language="unsupported")

    def test_hindi_answer_guard(self):
        self.assertEqual(checked_answer('{"answer":"यह मॉडल का अनुमान है; जाँच आवश्यक है।"}', "hi"),
                         "यह मॉडल का अनुमान है; जाँच आवश्यक है।")
        for content in ['{"answer":"English only"}', '{"answer":"मान ५० है।"}', '{"answer":"रोग निश्चित है।"}']:
            with self.subTest(content=content), self.assertRaises(ValueError):
                checked_answer(content, "hi")

    def test_hindi_facts_preserve_stored_numeric_value(self):
        service=ChatService(None,None)
        evidence=[{"result":{"classification":{"status":"unavailable"},
                   "segmentation":{"status":"unavailable","affected_fraction":None},
                   "metrics":[{"name":"CWSI","value":.5,"unit":"index","status":"available"}]}}]
        answer=service.facts_for(evidence,"hi")
        self.assertIn("CWSI: 0.5 index",answer)
        self.assertIn("उपलब्ध नहीं",answer)
