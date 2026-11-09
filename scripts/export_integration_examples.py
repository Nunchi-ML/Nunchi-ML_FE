"""Export synthetic UI cases by executing the existing Python guidance probe.

No model inference is fabricated: these are labelled contract examples, not
photographs, joint model accuracy, or guidance for the current driving route.
"""
from copy import deepcopy
import hashlib
import importlib.util
import json
from pathlib import Path


root = Path(__file__).resolve().parents[1]
probe = root.parent / "AI/notebooks/experiments/sun_visible_probe/integration_probe.py"
spec = importlib.util.spec_from_file_location("integration_review_probe", probe)
module = importlib.util.module_from_spec(spec)
# dataclasses resolves this module while building Policy.
import sys
sys.modules[spec.name] = module
spec.loader.exec_module(module)


def query():
    return dict(observation_id="example-entry-photo", segment_id="example-entry",
                image_sha256="a" * 64, lat=35.8, lon=128.6, heading=1.,
                captured_at="2026-11-06T08:00:00+09:00",
                as_of="2026-11-06T08:00:05+09:00", eta="2026-11-06T08:00:05+09:00", zone="entry")


def component(model, level):
    a, b = (.2 if level == 0 else .8), (.8 if level == 2 else .2)
    context = {k: v for k, v in query().items() if k not in ("as_of", "eta", "zone")}
    context.update(received_at="2026-11-06T08:00:01+09:00")
    return dict(context=context, source="recorded_photo", status="candidate",
                artifact_sha256="b" * 64,
                model_version="photo-g-candidate-v1" if model == 2 else "synthetic-model3-not-trained",
                variant="B_geometry_aug" if model == 2 else "ridge_estimated_luminance_two_stage",
                target="photo_glare_0_1_2" if model == 2 else "entrance_contrast_low_mid_high",
                zone="entry", estimated_luminance_cd_m2=1000., level=level,
                alert_score=a, conditional_high_score=b, joint_scores=[1-a, a*(1-b), a*b])


def case(name, title, m2=0, m3=2):
    return dict(case_id=name, title=title, evidence="synthetic_contract_not_model_accuracy",
                query=query(), model2=None if m2 is None else component(2, m2),
                model3=None if m3 is None else component(3, m3),
                policy=dict(max_age_seconds=10, max_distance_m=5, heading_tolerance_degrees=5))


cases = [case("matched", "같은 관측 · 눈부심 정상 / 입구 상"),
         case("normal", "두 원인 모두 낮은 등급", 0, 0),
         case("missing", "밝기 전환 결과 누락", 0, None),
         case("warning-partial", "눈부심 경고는 남기고 누락 표시", 2, None),
         case("different-photo", "다른 사진의 결과"),
         case("stale", "오래된 관측"),
         case("future", "도착 시점의 상태는 미확인")]
cases[4]["model3"]["context"]["image_sha256"] = "c" * 64
cases[5]["query"]["as_of"] = cases[5]["query"]["eta"] = "2026-11-06T08:01:00+09:00"
cases[6]["query"]["eta"] = "2026-11-06T08:01:00+09:00"
results = module.run_cases(deepcopy(cases))
payload = dict(schema_version="integration-review-examples-v1",
               generated_by="AI integration_probe.run_cases",
               probe_sha256=hashlib.sha256(probe.read_bytes()).hexdigest(),
               evidence="synthetic_contract_not_model_accuracy",
               cases=[dict(id=c["case_id"], title=c["title"], report=r)
                      for c, r in zip(cases, results)])
target = root / "src/data/integration_examples.json"
target.write_text(json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
print(f"Exported {len(results)} explicitly synthetic cases from the Python probe.")
