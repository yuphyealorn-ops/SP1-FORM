# Project notes

## Why a pretrained pose model and a published equation

| Approach | Available evidence | Decision |
| --- | --- | --- |
| Train an image-to-body-fat network | No paired photos and reference body-composition labels (such as DXA) are available to us | No training run or invented scores |
| Use pretrained MediaPipe pose landmarks | Official browser task, documented model, no local annotation needed | Use for the optional framing check |
| Use a published measurement equation (RFM) | Height and tape-measured waist are explicit user inputs | Show a separate, clearly labelled estimate |
| Track body-part tape measurements | The user measures them; no model needed | Feature A: record, validate and chart them |

## Data flow

```text
Camera snapshot / local photo
  -> browser canvas
  -> pretrained pose model
  -> landmark overlay + framing feedback (never saved)

Entered measurements
  -> input validation (metrics.js)
  -> RFM / BMI / derived mass calculation
  -> saved check-in

Optional body-part measurements            (data format ready in Week 1; form fields in Week 2)
  -> range checks (metrics.js)
  -> saved with the check-in

Workout log
  -> title, minutes, exercise count

Check-ins + workout log
  -> validated browser local storage (format v2; v1 data upgraded when the app starts)
  -> user-requested JSON export
```

The Python process supplies static files and two read-only status routes. It performs no inference, stores no profile, and accepts no uploaded photograph. The frontend requests model/runtime files only when scanning is needed. The server's content security policy limits executable scripts and connections to the local app and the specified model hosts; there is no analytics integration.

The optional installer writes each completed file with an atomic rename. A partially completed set stays unavailable to the browser until all six assets are present. Existing non-empty assets can be replaced with `--force`. This checks transfer completeness, not publisher authenticity or model quality.

## A defensible future training study

Actual image-based composition estimation would require a separate, explicitly consented dataset pairing standardized captures with reliable reference measurements. Define the target before collecting data; BMI category is not a measured body-fat label. Split by participant to avoid leakage, preserve a held-out test set, compare simple measurement baselines, and evaluate error by relevant population groups and capture conditions. Report sample sizes, missingness, error distributions, and calibration without substituting pose confidence for target accuracy.

That work is outside this project because its required labels and evaluation evidence are absent. The project deliberately makes its data sources and estimation boundary visible in both the interface and [model card](model-card.md).
