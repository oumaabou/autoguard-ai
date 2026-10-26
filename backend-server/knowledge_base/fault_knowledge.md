# AutoGuard AI — Fault Knowledge Base (Draft)

This is the source content for the RAG chatbot's knowledge base, mapped to the six classes the CNN already outputs. It's meant to be reviewed and edited before being loaded into Supabase — a machine-readable version of the same content is in `fault_knowledge.json`.

A note on scope: two of these labels (`bearing_fault`, `rotor_misalignment`, `broken_rotor_bars`, `voltage_unbalance`) come from an industrial electric-motor fault dataset, not an automotive one, so the content below maps each label to the closest real, well-documented vehicle equivalent (wheel/accessory bearings, belt-pulley alignment, EV traction motor windings, alternator charging system) rather than a car engine fault specifically. `bowed_rotor` has two reasonable readings — a warped brake rotor (most consumer-relatable, best cost data) or a bent motor/engine shaft (closer to the dataset's literal meaning) — both are included so you can pick the framing that fits your report.

---

## 1. Bearing Fault

**Vehicle context:** Wheel hub bearing, or a rotating accessory bearing (alternator, A/C compressor, power steering pump, water pump)

**What it means:** A bearing lets a wheel or spinning accessory part rotate smoothly with minimal friction. When it wears out or gets damaged, it starts grinding instead of spinning freely — acoustically, a rhythmic droning or whining noise that changes with speed or engine RPM.

**Common causes:**
- Pothole or curb impact (wheel bearings take the car's full weight at that contact point)
- Worn seal letting water, dirt, or road salt into the bearing
- Normal wear over tens of thousands of miles
- Low or degraded lubrication in accessory bearings

**Symptoms:**
- Rhythmic humming/droning noise that gets louder with speed (wheel bearing)
- Steering wheel vibration or looseness
- Uneven tire wear
- High-pitched whining/squealing that changes pitch with engine RPM (alternator/accessory bearing)
- Dim headlights or dashboard lights, hard starting (if it's the alternator bearing)

**Urgency: High.** A failed wheel bearing can seize or collapse without warning — at highway speed that can mean sudden loss of control. A seized accessory bearing can lock up and snap the serpentine belt, killing power steering and engine cooling too.

**Typical cost:** $230–$650. Wheel bearing: parts $80–250 + labor $150–400 per wheel. Alternator bearing only: $150–380. Full alternator (if bearing-only isn't offered): $350–900+.

**Questions to ask a mechanic:**
- Which specific bearing is being replaced — wheel hub, or an accessory bearing?
- Can you show me the worn part or the play/roughness when spun by hand?
- Is a bearing-only repair possible, or does the whole assembly need replacing?
- Can I get an itemized quote (parts vs labor) first?

**Sources:** [Identifix](https://www.identifix.com/blogs/8-symptoms-of-a-bad-wheel-bearing/), [PriorityTire](https://www.prioritytire.com/blog/bad-wheel-bearing), [AutoNation Mobile Service](https://www.autonationmobileservice.com/i/blog/alternator-bearing-replacement-cost/)

---

## 2. Bowed Rotor

**Vehicle context:** Primary mapping: warped brake rotor. Alternate technical mapping: a bent/warped internal motor or crankshaft rotor.

**What it means (brake rotor):** The flat metal disc a brake pad clamps onto has worn unevenly or warped, usually from uneven heat — no longer perfectly flat, felt as a pulsing brake pedal.

**What it means (motor/engine shaft):** An internal rotating shaft (engine, alternator, or EV/hybrid traction motor) has physically bent slightly, often from being shut off very hot and restarted too soon, throwing rotation off-balance.

**Common causes:**
- (Brakes) Overheating from hard/prolonged braking, e.g. long downhill descents
- (Brakes) Lug nuts torqued unevenly or too tight
- (Brakes) Normal age/wear
- (Motor/engine) Shutting down hot and restarting too soon
- (Motor/engine) Bearing or thrust-surface wear letting the shaft run off-center

**Symptoms:**
- Pulsating brake pedal when braking
- Steering wheel vibration specifically when braking
- Rhythmic noise/vibration scaling with braking pressure
- (Motor/engine variant) Knocking or rattling noise, general vibration, possible dashboard warning light

**Urgency: Medium-High.** Warped brake rotors reduce braking consistency and stopping distance — address promptly. A genuinely bowed engine/motor shaft is more serious and needs dealer/specialist diagnosis.

**Typical cost:** $15–$600. Resurfacing: $15–35/rotor. Full replacement: $300–600 (or $200–500 for a full brake job incl. pads). Motor/engine shaft repairs aren't standardized — get a dealer quote.

**Questions to ask a mechanic:**
- Is this actually a brake rotor issue, or something inside the engine/motor?
- Can the rotor be resurfaced instead of replaced?
- If it's a motor/shaft issue, can I see the diagnostic reading pointing to it?

**Sources:** [CarParts.com](https://www.carparts.com/blog/warped-rotor-symptoms-plus-faq/), [AutoNation Mobile Service](https://www.autonationmobileservice.com/i/blog/warped-rotor/), [The Diesel Dudes](https://thedieseldudes.com/blogs/news/gm-3-0l-duramax-thrust-bearing-failure-what-to-know)

---

## 3. Broken Rotor Bars

**Vehicle context:** EV/hybrid traction motor, or the internal windings of a starter motor / alternator armature

**What it means:** Inside an electric motor's spinning rotor are metal bars/windings that carry current and generate rotating force. If one or more cracks or breaks, the motor can't produce smooth, even power — pulsation, extra vibration, reduced efficiency.

**Common causes:**
- Repeated overload or sudden load changes, especially during startup
- Prolonged high operating temperature
- Manufacturing defects or weak joints (less common)
- Age and accumulated thermal cycling stress

**Symptoms:**
- Increased vibration and unusual noise during operation
- Motor running hotter than normal
- Reduced torque or efficiency (for an EV: reduced range or sluggish acceleration)
- Torque pulsations or speed fluctuations under load

**Urgency: High.** If this is the EV/hybrid traction motor, it's a major drivetrain component — check warranty status before paying out of pocket. If it's a starter/alternator armature, less catastrophic but still needs addressing.

**Typical cost:** $3,000–$8,000+ for an EV/hybrid traction motor (Tesla-specific: $5,000–$7,000), often warranty-covered on newer EVs — requires a dealer or certified EV specialist, not a general shop. Starter/alternator armature repair is far cheaper (~$350–900, comparable to standard alternator work) but rarer to diagnose this specifically without lab equipment.

**Questions to ask a mechanic:**
- Is my vehicle's motor/drivetrain still under manufacturer or powertrain warranty?
- What diagnostic evidence points to broken rotor bars specifically, vs. a simpler fault?
- Is a certified high-voltage/EV technician handling this?

**Sources:** [Motors & Pump](https://motorsandpump.com/ac-motor-rotor-bar-failure/), [Blazing EV](https://www.blazingev.com/what-is-the-cost-to-replace-an-ev-motor/), [Daze](https://www.daze.eu/en/blog/electric-car-motor-price-real-costs-and-complete-guide-to-replacement)

---

## 4. Healthy / No Fault Detected

**What it means:** The recorded acoustic pattern matches normal, healthy operation for the fault types this app screens for. This is a targeted acoustic screen, not a full mechanical inspection — it doesn't rule out issues outside these specific categories.

**Urgency: None.** No action needed based on this reading; continue your vehicle's normal maintenance schedule.

---

## 5. Rotor Misalignment

**Vehicle context:** Belt-driven accessory pulley (alternator, A/C compressor, power steering pump) out of alignment with the serpentine belt

**What it means:** One of the pulleys the serpentine belt rides on isn't lined up right with the others, so the belt rubs or flexes sideways instead of running flat — extra friction, noise, and accelerated wear on the belt and the component.

**Common causes:**
- Worn or loose accessory mounting brackets
- Improper installation after a previous repair (e.g. alternator or A/C compressor swap)
- Worn-out belt tensioner or idler pulley

**Symptoms:**
- Loud squealing from the front of the engine, especially on startup or turning
- Visible belt slipping, fraying, or shedding material
- Reduced power steering assist, weaker A/C, or inconsistent charging as a downstream effect

**Urgency: Medium.** Usually won't strand you immediately, but accelerates wear and can escalate to a snapped belt (losing power steering and cooling) if ignored.

**Typical cost:** $100–$500. Realignment labor alone: $100–400. If a tensioner/idler pulley needs replacing too: $200–500+. A new belt: $90–250.

**Questions to ask a mechanic:**
- Which pulley is out of alignment, and can you show me the belt wear pattern indicating it?
- Is this a simple realignment, or does a component need replacing?
- Will you inspect the whole belt path, not just replace the belt?

**Sources:** [Psycho Autos](https://psychoautos.com/how-to-fix-misaligned-serpentine-belt/), [Oards](https://oards.com/serpentine-belt-symptoms-and-cost/), [Save More Automotive](https://www.savemoreautomotive.com/blog/the-serpentine-belt-squeal-causes-and-average-replacement-costs/)

---

## 6. Voltage Unbalance

**Vehicle context:** Charging system — alternator and/or its voltage regulator

**What it means:** The alternator (and its voltage regulator) should deliver steady, consistent voltage to charge the battery and run the electrical system. When the regulator fails, voltage swings up and down instead of staying steady, either overcharging or undercharging.

**Common causes:**
- Failing voltage regulator (built into the alternator on most modern cars)
- Worn alternator diodes or windings
- Loose or corroded electrical connections

**Symptoms:**
- Flickering/dimming headlights and interior lights, especially at night
- Dashboard battery warning light
- Engine stalling
- Dead or frequently draining battery
- Severe cases: voltage spikes damaging sensitive electronics

**Urgency: Medium-High.** Can leave you stranded with a dead battery or a stall; sustained overcharging can damage other electronics over time.

**Typical cost:** $150–$1,000. Voltage regulator alone (if separate): $150–500. Full alternator (more common since the regulator is usually integrated): $400–1,000 total.

**Questions to ask a mechanic:**
- Can you confirm this with a multimeter reading (should read ~13.5–14.5V running), not just a guess?
- Is the regulator separate or integrated into the alternator on my vehicle?
- Is there a reputable rebuilt/remanufactured option to bring the cost down?

**Sources:** [CarParts.com](https://www.carparts.com/blog/bad-voltage-regulator-symptoms-testing-replacement-cost-more/amp/), [CarTreatments](https://cartreatments.com/bad-voltage-regulator-symptoms-replacement-cost/), [JS Alternators](https://js-alternators.com/blogs/blog/alternator-voltage-regulator)
