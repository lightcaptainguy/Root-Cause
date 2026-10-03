import asyncio
import io
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from backend.chat import ChatService, checked_answer
from backend.config import Settings
from backend.contracts import EvidenceItem, ObservationMetadata, Zone
from backend.errors import ServiceError
from backend.experimental import overlays
from backend.ingestion import import_image
from backend.jobs import JobRunner
from backend.storage import Store


class ToolAndQueueTests(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory()
        self.settings=Settings(data_dir=Path(self.directory.name),queue_capacity=1)
        self.store=Store(self.settings.data_dir); self.store.add_zone(Zone(id="z",name="Z"))
        buffer=io.BytesIO()
        image=Image.new("RGB",(200,100),"white")
        image.paste((20,150,30),(50,20,150,80))
        image.paste((160,100,30),(80,40,100,60))
        image.save(buffer,"PNG")
        self.contents=buffer.getvalue()
        self.metadata=ObservationMetadata(zone_id="z",image_kind="closeup_leaf",source={"kind":"simulated"})
        self.observation=import_image(self.store,self.settings,self.contents,self.metadata)

    def tearDown(self):
        self.directory.cleanup()

    def test_queue_full_and_idempotent_pending_submit(self):
        runner=JobRunner(self.store,self.settings,None)
        first=runner.submit(self.observation.id)
        repeated=runner.submit(self.observation.id)
        self.assertEqual(first.id,repeated.id)
        second=import_image(self.store,self.settings,self.contents,self.metadata)
        with self.assertRaises(ServiceError) as caught:
            runner.submit(second.id)
        self.assertEqual(caught.exception.status,429)
        self.assertIsNone(self.store.active_job(second.id))

    def test_tools_cannot_write_or_escape_context(self):
        chat=ChatService(self.store,self.settings)
        refs=[EvidenceItem(kind="observation",id=self.observation.id,title="Observation",observation_id=self.observation.id)]
        result=chat.read_tool("calculate_cwsi",{"observation_id":self.observation.id},refs)
        self.assertIsNone(result["metrics"][0]["value"])
        for name,args in [("delete_observation",{"observation_id":self.observation.id}),
                          ("read_observation",{"observation_id":"other"}),
                          ("read_observation",{"observation_id":[]}),
                          ("read_observation",{"observation_id":self.observation.id,"sql":"DROP TABLE"})]:
            with self.subTest(name=name,args=args):
                self.assertIn("error",chat.read_tool(name,args,refs))
        self.assertEqual(self.store.observation(self.observation.id).id,self.observation.id)

    def test_explanation_rejects_numbers_certainty_and_bad_format(self):
        self.assertEqual(checked_answer('{"answer":"The image suggests a leaf condition that needs verification."}'),
                         "The image suggests a leaf condition that needs verification.")
        for value in ['{"answer":"Soil moisture is 30 percent."}', '{"answer":"Disease confirmed."}',
                      '{"answer":"","extra":"field"}', 'not-json']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                checked_answer(value)

    def test_experimental_geometry_and_mask_dimensions(self):
        path,_=self.store.asset(self.observation.image.url.rsplit("/",1)[-1])
        localization,segmentation,warnings=overlays(self.store,self.observation,path)
        self.assertEqual(localization.status,"available")
        self.assertIn("experimental",segmentation.method)
        coordinates=localization.boxes[0].coordinates
        self.assertEqual(coordinates,(50,20,150,80))
        self.assertAlmostEqual(segmentation.affected_fraction,400/6000)
        mask_path,_=self.store.asset(segmentation.mask_url.rsplit("/",1)[-1])
        with Image.open(mask_path) as mask:
            self.assertEqual(mask.size,(200,100))
            self.assertEqual(mask.getpixel((90,50))[3],150)
            self.assertEqual(mask.getpixel((10,10))[3],0)


if __name__ == "__main__":
    unittest.main()
