# Model card

This project has two independent components. It does not contain a trained image-to-body-fat model.

## Pose scan

| Item | Choice |
| --- | --- |
| Provider | Google MediaPipe |
| Browser runtime | `@mediapipe/tasks-vision@1.1.1` |
| Checkpoint | Pose Landmarker Lite, float16, revision 1 |
| Input | One camera snapshot or locally selected photo |
| Output | Body landmarks and a full-body framing check |
| Execution | Browser, using WebAssembly |
| Local fine-tuning | None |
| Project-specific accuracy / latency | Not measured |

MediaPipe's task combines a person detector and a pose landmarker, producing 33 body landmarks. The app uses them to draw an overlay and check visibility/framing; a framing score is not confidence in a body-composition estimate. The pretrained model was chosen because the repository has no labeled pose or body-composition dataset. [Official task documentation](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker), [browser integration guide](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js).

Poor lighting, occlusion, cropping, distance, and unusual pose can reduce detection quality. The app does not identify people, diagnose posture, or infer physical health from landmarks. The upstream card describes model scope and evaluation; its results are not this app's results. [Google's BlazePose GHUM model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf).

MediaPipe code and the model card identify Apache License 2.0. Preserve upstream license/notice requirements when redistributing downloaded assets. [MediaPipe license](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE), [Apache 2.0 license text](https://www.apache.org/licenses/LICENSE-2.0).

## Measurement estimator

RFM uses `64 − 20 × (height / waist) + 12 × sex`, where the published equation encodes male as 0 and female as 1. Height and waist must use the same units. This parameter is selected by the user and never inferred from a photo. The study's independent validation covered ages 20–69; the app uses that age range. The paper flags uncertain generalization to Asian populations, athletes, children, and some medical conditions. [Woolcott & Bergman, 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC6054651/).

Use a horizontal tape at the upper edge of the hip bone, measured standing after a normal exhalation, following the study's measurement location. Repeated measurements should use the same method. The study used DXA as its reference; the app has not been evaluated against DXA. [Study methods](https://pmc.ncbi.nlm.nih.gov/articles/PMC6054651/).

Derived values are `fat mass = weight × RFM / 100`, `fat-free mass = weight − fat mass`, and `BMI = kg / metres²`. Fat-free mass includes organs, bone, and water as well as muscle. Pose coordinates do not enter these calculations.

These are experimental wellness outputs. The binary historical equation does not represent every person's physiology. Do not treat changes as proof of muscle gain or fat loss. The app rejects invalid inputs and implausible outputs instead of presenting a clamped result as a measurement.

## Body-part measurements

Body-part measurements (chest, shoulders, hip, and left/right upper arm, thigh and calf) are optional tape measurements in centimetres, stored with each check-in from data format version 2 on ([storage-v2.md](storage-v2.md)). They are range-checked to catch typos ([measuring-guide.md](measuring-guide.md)), and nothing is inferred from photos. Left and right are stored separately. No equation or model uses them: they are recorded and, from Week 3, charted as they were entered.

A tape measurement includes muscle, fat, skin and water, and depends on measuring technique, so a change in circumference is not proof of muscle gain or fat loss.

Muscle points (Feature B) will be documented here when they are built in Weeks 4–7.

## Provenance and validation status

The optional downloader pins the runtime version and checkpoint revision and records SHA-256 hashes after retrieval. Those hashes are records, not independently authenticated publisher digests. The server's `local` flag checks six non-empty files, not model correctness. Browser fallback uses the same pinned sources.

There are no new training results, comparison scores, or clinical accuracy claims. Unit tests verify software behavior and arithmetic; live inference still needs checking with a supported browser, real model assets, and consenting test subjects. A release intended for wider use needs independent accuracy, accessibility, and population-specific evaluation.
