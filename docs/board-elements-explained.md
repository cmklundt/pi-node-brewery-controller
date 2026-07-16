# Board Elements — What Each Part Does, and Who Else Has It

Every functional block on the shield: what it's for, why it's there, and how it compares to the three boards you were choosing between.

**The comparison set**
- **BrewThings CraftBeerPi PCB v2** — the closest existing board to ours
- **CraftBeerPi Basic Shield** — open-source (MIT), Pi 3/4/5, sold via PCBWay
- **Terragady** — popular third-party CBPi shield
- **Original CBPi shield** (Manuel Fritsch) — the ancestor of all of them

**Confidence note:** my detail on BrewThings v2 is solid (its feature list is published). My picture of Terragady's and the Basic Shield's internals is thinner — treat those columns as "believed, not verified." Where I say "none have this," read it as "none that I could confirm."

---

## 1. The 40-pin header
**Purpose.** Mechanical and electrical connection to the Pi. Carries 3V3, 5V, GND, SPI, and every GPIO we use.
**Why it matters.** Under HAT+ this is the *only* hard requirement — dimensions are otherwise flexible.
**Competitors.** All four have it. This is table stakes.

## 2. Buffer / driver stage — the actual reason shields exist
**Purpose.** A Pi GPIO sources only ~16 mA, with ~50 mA total across all pins. A relay coil wants 50–100 mA and three SSRs can nearly max the budget. The buffer takes the GPIO's *signal* and uses a separate supply to do the *work*.
**Ours.** Logic-level MOSFETs — 2N7002 for SSR triggers, AO3400 for relay coils.
**Competitors.** All of them have some form of this; it's the core function. The original CBPi shield used a **discrete transistor per channel**; brewers on the forums noted a **ULN2803 Darlington array** does the same job more simply — which is where our design started before moving to individual FETs.
**Verdict:** universal. Not a differentiator.

## 3. 4× MAX31865 — PT100 sensing
**Purpose.** A PT100 is an analog RTD (100 Ω at 0 °C). It can't talk to a Pi directly. Each MAX31865 converts one RTD to SPI.
**Ours.** Four bare-chip MAX31865s (QFN-20-EP), one per vessel: HLT, mash, boil, fermenter.
**Supporting parts:** a **430 Ω 0.1% reference resistor** per channel (430 Ω is the PT100 value — 4300 Ω would be PT1000), an RC input filter, and 100 nF decoupling.
**Competitors.** BrewThings v2 has **three MAX31865 pin headers** — for *modules*, not bare chips. The Basic Shield has **one PT100 input**. The original CBPi reference build doesn't use PT100 at all; it uses **DS18B20 1-Wire sensors with a 4.7k pull-up on GPIO4**.
**Verdict:** **a real differentiator.** You have four probes; BrewThings tops out at three. Also the reason your software needs the cbpi4-pt100x plugin rather than CBPi's native 1-Wire path.

## 4. SPI bus + 4 chip selects
**Purpose.** All four MAX31865s share SCLK/MOSI/MISO; each gets its own CS so the Pi can address them individually. ~7 pins for four sensors.
**Validation:** the cbpi4-pt100x plugin expects exactly this — miso 9, mosi 10, clk 11 fixed, CS configurable per probe.
**Competitors.** Same approach wherever MAX31865s appear.

## 5. Galvanic isolation — ISO7741 ×2
**Purpose.** A hard electrical barrier between the Pi and the drive side. Two separate ground domains (GND and GND_ISO) that never touch. Digital isolators pass the six control signals across the gap optically/capacitively, so a fault on the actuator wiring, an SSR failure, or a surge on the relay coils **cannot reach the Pi**.
**Why it's here.** You're switching 240 V at ~23 A a few feet away, in a wet room.
**Competitors.** **None of the three have this.** They buffer, which protects against *current draw*, but buffering is not isolation — a fault still has a conductive path home.
**Verdict:** **the strongest differentiator on the board.** Also why our extended-part count (and cost) is higher.

## 6. Flyback diodes + snubber
**Purpose.** When you de-energize an inductive load (relay coil, pump motor), the collapsing magnetic field produces a voltage spike that arcs contacts and kills semiconductors. Flyback diodes give it somewhere to go. The snubber on the glycol channel handles the pump's motor characteristics.
**Note.** The ULN2803 we originally specified has these *built in*; discrete FETs need them added explicitly. That's a real cost of the FET choice.
**Competitors.** Anything driving relays needs this; assume all have some form.

## 7. Screw terminals `[V+ | OUT]`
**Purpose.** Field wiring with a screwdriver, no soldering. Each channel gives you a `V+` (from the selected rail) and an `OUT` (the FET sinks it to ground). Your external SSR or relay wires across the pair.
**Ours.** 3.5 mm pluggable — the plug comes off with the wires attached, so you can pull the board without rewiring.
**Competitors.** The **PiFace shield** is called out in CraftBeerPi's own docs specifically for offering **screw terminals for easy connection of actors** — this idea predates us by years.
**Verdict:** common and correct. Not a differentiator, just table stakes done well.

## 8. JP1 / JP2 — drive rail select (5 V / 12 V per bank)
**Purpose.** Sets what feeds each terminal's `V+`. The MOSFET sinks the load either way; the jumper just picks the supply.
**Why it's here.** You don't know your relay coil voltage, and this makes the board correct either way — and survives you swapping relays later.
**Competitors.** **Each fixes one rail.** BrewThings v2 specifies **7× 5 VDC outputs** with a 12 V→5.5 V converter. The original CBPi shield assumes a **12 V/5 A supply**. Terragady is chosen precisely because the voltages are "taken care of" for you.
**Honest caveat.** Fixing the rail isn't wrong — it's one less thing to misconfigure. A jumper *adds* a way to destroy a 5 V coil with 12 V. That's why it's silkscreened, defaulted to 5 V, and warned about.
**Verdict:** a convenience differentiator, not a headline.

## 9. Power input chain — DC jack → P-FET → TVS → PTC fuse
**Purpose.** Layered protection on the 12 V input. The **P-FET** blocks reverse polarity (plug the barrel in backwards and nothing happens). The **SMAJ TVS** clamps surges. The **PTC** is a resettable fuse — it opens on overcurrent and heals itself, no fuse to replace.
**Competitors.** BrewThings v2 has a 12 V→5.5 V converter, so it takes 12 V in. Protection depth unconfirmed.

## 10. Buck converter — 12 V → 5 V @ 4 A
**Purpose.** One power brick runs everything: the board, the drive rail, and the Pi itself. No separate USB supply.
**Competitors.** BrewThings v2 does this (12 V→5.5 V). Common and sensible.

## 11. LM66100 ideal diode
**Purpose.** Back-power protection. If the board feeds the Pi's 5 V pins *and* someone plugs in a USB-C supply, the two fight. An ideal diode makes the flow one-way.
**Why it's not optional.** The HAT+ spec **requires** an ideal safety diode if you back-power the Pi via the 5 V pins. This isn't a nicety — it's compliance.
**Competitors.** Unconfirmed. Boards that feed 5 V without one are taking a risk.

## 12. Status LEDs — one per output
**Purpose.** See at a glance which channel is driving. Placed on the **drive side** of the isolation barrier so they reflect the actual FET state, not the GPIO's intent.
**Note.** These are *board* LEDs, distinct from your **panel pilot lights**, which are wired load-side across each outlet and show real power at the plug. The pilot lights are the ground truth; these are diagnostics.

## 13. Buzzer
**Purpose.** Audible alerts — hop additions, step transitions, alarms.
**Software.** CBPi's **buzzer plugin** triggers it on any notification.
**Competitors.** BrewThings v2 has one. The original CBPi shield has one — CBPi's docs describe the buzzer plugin as triggering "the buzzer on your extension board." **Universal.**

## 14. 1-Wire header (DS18B20)
**Purpose.** GPIO4 + 4.7k pull-up. A backup/bonus probe using CBPi's *native* sensor path — no plugin needed.
**Why keep it.** It's nearly free (one resistor, one header) and it's your fallback if a PT100 channel ever misbehaves.
**Competitors.** BrewThings v2 has DS18B20 inputs. The CBPi reference build is built entirely on this.

## 15. Flow-meter inputs ×2
**Purpose.** Hall-effect pulse inputs with pull-up and RC debounce — volume measurement for sparge/transfer.
**Competitors.** BrewThings v2 has a flow-sensor input. Not exotic.

## 16. Rotary encoder + OLED header
**Purpose.** Standalone control without a tablet. Turn/click to set temps; the OLED shows readouts.
**Competitors.** Not typical on these shields.
**Honest read.** A convenience, and arguably the first thing to cut — you're building a touch dashboard anyway.

## 17. Selector-sense opto (PC817) + 330 Ω
**Purpose.** Reads a **dry contact** from your element selector's spare pole, so software knows which element is armed. Opto-isolated because it crosses into the panel.
**The 330 Ω is not decorative.** The HAT+ spec requires protecting against old firmware driving **GPIO 6, 14, or 16** at boot if the board also drives them. Our opto drives GPIO16 — exactly that case. LCSC **C23138** (Basic tier, free to place).
**Competitors.** None have this, because none assume a hardware interlock. It's specific to your panel.

## 18. HAT ID EEPROM (AT24C32) + 3.9 kΩ pull-ups
**Purpose.** Lets the Pi auto-identify the board at boot.
**Spec rule.** ID_SD/ID_SC (GPIO0/1) must carry the EEPROM **and nothing else**, with 3.9 kΩ pull-ups. This is a HAT+ requirement, not a feature.
**Competitors.** Adafruit sells the Perma-Proto HAT in **with-** and **without-EEPROM** versions, so it's a recognized option in this space.

## 19. Mounting holes / standoffs
**Purpose.** Mechanical support. A 125×95 mm board with screw terminals and wire loads pulling on it must not hang off the header alone.
**Spec rule.** HAT+ requires **at least one hole aligned** with a Pi mounting hole; the old rigid 65×56.5 mm outline is **deprecated**. Use **15–16 mm standoffs** so a Pi Active Cooler fits underneath, and keep clear of the **PoE header**.

---

## Where a competitor beats us

**BrewThings v2 has two mechanical relays on the board. Ours has none.**

That's a genuine trade, and it's worth being honest that in this one respect their board is *more* integrated — you could switch two small 120 V loads with nothing but their PCB.

We deliberately went all-external because your loads argue for it: two 5500 W elements at ~23 A need 40 A heatsinked SSRs (no PCB relay is in that league), and the glycol pump is a motor needing an inrush-rated relay. Putting mains relays on a HAT also puts mains on the board — the one thing we ruled out on turn one.

So: their choice is reasonable for small loads; ours is right for yours. But "more capable" isn't true on every axis, and you should know where.

---

## Summary — what actually makes this board better

| Element | BrewThings v2 | Basic Shield | Ours |
|---|---|---|---|
| PT100 channels | 3 (module headers) | 1 | **4 (integrated)** |
| Galvanic isolation | — | — | **Yes (ISO7741)** |
| Buffered outputs | 7 × 5 V | yes | 6, isolated |
| Onboard relays | **2** | ? | none (external by design) |
| Drive rail | fixed 5 V | fixed | **5 V/12 V jumper** |
| Fermentation support | — | — | **Yes** |
| DS18B20 / flow / buzzer | yes | ? | yes |
| Encoder + OLED | — | — | yes |
| Selector sense | — | — | **Yes** |
| ID EEPROM | ? | ? | yes |

**The three that justify the build:** four PT100 channels, true galvanic isolation, and brew-day + fermentation on one board. Everything else is convenience — and convenience is what you cut first if you want the extended-part count (and the cost) down.
