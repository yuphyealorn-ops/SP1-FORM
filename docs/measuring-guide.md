# Measuring guide

How to take the tape measurements FORM asks for at each check-in. A tape reading can easily change by 0.5–1 cm depending on where and how you hold the tape, which is about as much as a few weeks of real change. **Measuring the same way every time matters more than being precise.**

All measurements except waist are optional. Measure only what you want to track, but once you start tracking a body part, measure it at every check-in.

## Before you start

- **Tape:** use a soft tape measure that doesn't stretch (cloth or fibreglass), in centimetres.
- **Time:** measure at the same time of day, ideally in the morning before eating or training. A workout pump can make an arm or thigh 1 cm bigger for a few hours.
- **Clothing:** measure on bare skin, or over the same thin clothing every time.
- **Stance:** stand upright and relaxed, feet about hip-width apart, weight on both feet. Don't flex, and don't pull your stomach in.
- **Tape position:** keep the tape level (parallel to the floor), and snug on the skin without pressing in. Check it in a mirror, or ask a friend to help.
- **Reading:** read the number at a normal breath out. Write it down to one decimal place, for example `33.5`.
- **Twice:** measure each spot twice and enter the average. If the two readings are more than 1 cm apart, measure again.
- **Left and right:** measure both sides the same way, one after the other. FORM stores them separately, so a difference between sides isn't hidden in an average.

## Where to put the tape

The **Short hint** column is the text the check-in form shows under each field from Week 2 on (`BODY_PARTS` in `public/js/metrics.js`). If you change a hint, change it in both places; a test compares each row with `BODY_PARTS`.

| Body part | Short hint | Full instructions |
| --- | --- | --- |
| Chest | Fullest part, arms relaxed | Wrap the tape under your armpits and around the fullest part of your chest (across the nipples for most people). Arms hang relaxed at your sides. Read after a normal breath out. |
| Shoulders | Widest point | With your arms relaxed at your sides, wrap the tape around the widest point of your shoulders, over the outside of the upper arms. This one is much easier with a helper. |
| Upper arm (L and R) | Halfway between shoulder and elbow | Let the arm hang relaxed, not flexed. Find the point halfway between the bony tip of your shoulder and the point of your elbow, and wrap the tape around the arm there. The first time, mark the spot or note how many centimetres it is below the shoulder tip, so you can find it again. |
| Waist (used for RFM) | Upper edge of the right hip bone | Wrap the tape horizontally around your waist at the upper edge of your right hip bone, and read it after a normal breath out without pressing into the skin. This is the spot the RFM body-fat equation was built on, so don't use the narrowest point or the belly button instead. |
| Hip | Widest part | Stand with your feet together and wrap the tape around the widest part of your buttocks. |
| Thigh (L and R) | Halfway between hip and knee | Stand with your weight on both legs. Wrap the tape around the thigh halfway between the crease at the top of your thigh and the top of your kneecap. As with the arm, note the spot for next time. |
| Calf (L and R) | Widest part | Stand with your weight on both feet and wrap the tape around the widest part of your calf. Move the tape up and down a little to find it. |

## Typing mistakes FORM catches

FORM rejects a value outside these ranges before it is saved, with a message that names the field. A test checks that this table matches the ranges in `BODY_PARTS`. The ranges are wide on purpose: they catch typing mistakes, not unusual bodies.

| Body part | Accepted range (cm) |
| --- | --- |
| Chest | 50 – 200 |
| Shoulders | 60 – 200 |
| Upper arm (L and R) | 15 – 70 |
| Waist | 45 – 200 |
| Hip | 50 – 200 |
| Thigh (L and R) | 25 – 100 |
| Calf (L and R) | 15 – 70 |

Typical mistakes they catch: a missing or misplaced decimal point (`335` or `3.35` instead of 33.5) and many values typed in inches (a 38-inch chest, a 14-inch calf). Not every inch value is caught: a 16-inch arm is within the centimetre range, so check the unit. If a genuine measurement is rejected, tell the team so the range can be widened. Don't round your measurement to fit the range.

## What these numbers can and can't tell you

A tape measurement includes muscle, fat, skin and water. A bigger upper arm can mean more muscle, more fat, or a different spot on the arm. Food, sleep, hydration and training pump all move the numbers from day to day. Look at the trend over several weeks rather than a single change, and treat the numbers as wellness estimates, not medical measurements.
