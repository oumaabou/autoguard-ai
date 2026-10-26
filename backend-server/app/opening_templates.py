"""
opening_templates.py
=====================
Hand-written opening explanations for each of the 6 CNN fault classes,
keyed by fault_type and (where the underlying component actually differs)
powertrain. This replaces the old Gemini-generated opener
(rag_engine.explain_fault, now removed): the CNN's classification is
already the "diagnosis" - all this message does is translate a fixed label
into plain words, which doesn't need an LLM call every time and can never
fail with a 503/high-demand error.

Follow-up questions in the chat (answer_question in rag_engine.py) still go
through Gemini/Groq as before, since those are genuinely open-ended.

Tone rules these were written to (per explicit user feedback): teacher
explaining to a beginner, not a friend chatting - plain everyday words,
short sentences, no jargon, no metaphors/analogies, no small talk. Each
variant is 29-35 words, states only what the issue is and how urgent it is,
and never mentions cost (see main.py's DiagnoseResponse.knowledge for the
cost figures, shown as their own UI element).
"""

_OPENING_TEMPLATES: dict[str, dict[str, str]] = {
    "bearing_fault": {
        "default": (
            "A bearing that lets a wheel or accessory part spin smoothly is "
            "wearing out, causing a grinding or whining noise. This is high "
            "urgency - a bearing can seize without warning, so get it "
            "checked soon."
        ),
        "electric": (
            "A wheel bearing that lets your wheel spin smoothly is wearing "
            "out, causing a grinding or whining noise. This is high urgency "
            "- it can seize without warning, so get it checked as soon as "
            "possible."
        ),
    },
    "bowed_rotor": {
        "default": (
            "A spinning shaft, likely in your turbocharger, may have "
            "warped slightly from uneven cooling after a hot shutdown. "
            "This needs proper diagnostic equipment to confirm - get it "
            "checked soon, don't let a shop just guess."
        ),
        "petrol": (
            "A spinning shaft, likely in your turbocharger, may have "
            "warped slightly from uneven cooling after a hot shutdown. "
            "This needs proper diagnostic equipment to confirm - get it "
            "checked soon, don't let a shop just guess."
        ),
        "hybrid": (
            "A spinning shaft - either your turbocharger or electric motor "
            "- may have warped slightly from uneven cooling after a hot "
            "shutdown. This needs proper diagnostic equipment to confirm, "
            "so get it checked soon."
        ),
        "electric": (
            "Your electric motor's shaft may have warped slightly from "
            "uneven cooling after sustained hard driving followed by a "
            "sudden shutdown. This needs proper diagnostic equipment to "
            "confirm, so get it checked soon."
        ),
    },
    "broken_rotor_bars": {
        "default": (
            "Metal bars inside your starter or alternator's rotor may have "
            "cracked, so it can't spin evenly anymore. This can cause "
            "rough starting or flickering lights. It's high urgency - get "
            "it checked soon."
        ),
        "petrol": (
            "Metal bars inside your starter or alternator's rotor may have "
            "cracked, so it can't spin evenly anymore. This can cause "
            "rough starting or flickering lights. It's high urgency - get "
            "it checked soon."
        ),
        "hybrid": (
            "Metal bars inside a motor's rotor may have cracked - either "
            "your traction motor or your starter/alternator. This can "
            "cause pulsation, reduced power, or rough starting. It's high "
            "urgency - get it checked soon."
        ),
        "electric": (
            "Metal bars inside your traction motor - the motor that "
            "drives your wheels - may have cracked, causing pulsation and "
            "reduced power. It's high urgency - check if it's still under "
            "warranty, and get it checked soon."
        ),
    },
    "healthy": {
        "default": (
            "No fault was detected in this reading. Your vehicle's "
            "acoustic pattern looks normal for the issues this app "
            "screens for. No action needed - just keep up with regular "
            "maintenance."
        ),
    },
    "rotor_misalignment": {
        "default": (
            "One of the pulleys your serpentine belt runs on isn't lined "
            "up right, making the belt rub and wear faster. It's not "
            "urgent, but get it checked soon to avoid a snapped belt "
            "later."
        ),
    },
    "voltage_unbalance": {
        "default": (
            "Your alternator's voltage regulator isn't holding a steady "
            "voltage, so it's over or undercharging your battery. This "
            "can leave you stranded, so it's worth getting checked soon, "
            "especially before a long drive."
        ),
    },
}


def build_opening_message(row: dict, powertrain: str | None = None) -> str:
    """Picks the right hand-written opener for a diagnosed fault_type, and
    appends the same "unusual for this powertrain" caveat the old
    Gemini-generated version used to add - the CNN already detected this
    exact fault_type from the audio, so it's never suppressed here even if
    it's unusual for the given powertrain; instead we say so plainly and
    point the owner at their mechanic rather than silently hiding a real
    detection."""
    fault_type = row.get("fault_type", "")
    variants = _OPENING_TEMPLATES.get(fault_type, {})
    text = (variants.get(powertrain) if powertrain else None) or variants.get("default")

    if text is None:
        # No hand-written template for this fault_type (shouldn't happen for
        # the 6 known CNN classes) - fall back to the stored explanation
        # column rather than raising, so /diagnose never 500s on a label
        # mismatch.
        text = row.get("explanation") or "A possible issue was detected with your vehicle. See the details below."

    applicable = row.get("applicable_powertrains") or []
    if powertrain and applicable and powertrain not in applicable:
        text += (
            f" Note: this fault type is unusual for a {powertrain} vehicle - "
            "ask your mechanic to confirm which component is actually affected."
        )
    return text
