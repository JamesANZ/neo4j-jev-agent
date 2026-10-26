const hotelSelect = document.querySelector("#hotel");
const questionInput = document.querySelector("#question");
const form = document.querySelector("#ask-form");
const askButton = document.querySelector("#ask");
const status = document.querySelector("#status");
const result = document.querySelector("#result");

const VERDICT_LABELS = {
  yes: "Yes",
  no: "No",
  not_in_record: "Not in the record",
};

function setStatus(message) {
  status.textContent = message;
}

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

function item(text) {
  const li = document.createElement("li");
  li.textContent = text;
  return li;
}

function section(title, lines) {
  const block = document.createElement("section");
  const heading = document.createElement("h2");
  heading.textContent = title;
  const list = document.createElement("ul");
  if (lines.length === 0) {
    list.append(item("No matching records"));
  } else {
    for (const line of lines) list.append(item(line));
  }
  block.append(heading, list);
  return block;
}

function roomLine(room) {
  const parts = [
    room.type ?? "Room",
    room.bed_configuration,
    room.max_occupancy == null ? null : `max ${room.max_occupancy} guests`,
    room.min_rate == null && room.max_rate == null
      ? null
      : `rate ${room.min_rate ?? "?"}–${room.max_rate ?? "?"}`,
  ];
  return parts.filter(Boolean).join(" · ");
}

function serviceLine(service) {
  const parts = [
    service.name ?? "Service",
    service.description,
    service.cost,
    service.hours,
    service.is_available == null
      ? null
      : service.is_available
        ? "available"
        : "unavailable",
    service.is_complimentary ? "complimentary" : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

function renderResult(payload) {
  result.replaceChildren();
  result.hidden = false;

  const verdict = document.createElement("h2");
  verdict.className = `verdict ${payload.verdict}`;
  verdict.textContent = VERDICT_LABELS[payload.verdict] ?? payload.verdict;

  const meta = document.createElement("p");
  meta.className = "meta";
  const confidence = document.createElement("span");
  confidence.textContent = `Confidence ${percent(payload.confidence)}`;
  meta.append(confidence);
  if (payload.needsReview) {
    const review = document.createElement("span");
    review.className = "review";
    review.textContent = "Needs review";
    meta.append(review);
  }
  const model = document.createElement("span");
  model.textContent = payload.model;
  meta.append(model);

  const asked = document.createElement("p");
  asked.className = "asked";
  asked.textContent = `${payload.hotelName}: ${payload.question}`;

  const details = document.createElement("details");
  details.open = true;
  const summary = document.createElement("summary");
  summary.textContent = "Facts retrieved for this question";
  const facts = document.createElement("div");
  facts.className = "facts";
  const sheet = payload.evidence;
  const hotelLines = [
    sheet.address,
    sheet.guest_rating == null ? null : `Guest rating ${sheet.guest_rating}`,
    sheet.total_rooms == null ? null : `${sheet.total_rooms} rooms`,
    sheet.phone,
    sheet.email,
    sheet.guest_count == null ? null : `Guest count asked: ${sheet.guest_count}`,
  ].filter(Boolean);
  if (hotelLines.length > 0) facts.append(section("Hotel", hotelLines));
  if (sheet.amenities) facts.append(section("Amenities", sheet.amenities));
  if (sheet.rooms) facts.append(section("Rooms", sheet.rooms.map(roomLine)));
  if (sheet.policies) {
    facts.append(
      section(
        "Policies",
        sheet.policies.map((policy) =>
          [policy.name, policy.description].filter(Boolean).join(": "),
        ),
      ),
    );
  }
  if (sheet.services) facts.append(section("Services", sheet.services.map(serviceLine)));
  details.append(summary, facts);
  result.append(verdict, meta, asked, details);
}

async function loadHotels() {
  setStatus("");
  try {
    const response = await fetch("/api/hotels");
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || "Could not load hotels.");
    }
    hotelSelect.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a hotel";
    hotelSelect.append(placeholder);
    for (const hotel of body.hotels) {
      const option = document.createElement("option");
      option.value = hotel.name;
      option.textContent = hotel.address
        ? `${hotel.name} — ${hotel.address}`
        : hotel.name;
      hotelSelect.append(option);
    }
    if (body.hotels.length === 0) {
      setStatus("The graph has no hotels.");
    }
  } catch (error) {
    hotelSelect.replaceChildren();
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Hotels unavailable";
    hotelSelect.append(option);
    setStatus(
      error instanceof Error ? error.message : "Could not load hotels.",
    );
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  result.hidden = true;
  setStatus("");
  askButton.disabled = true;
  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        hotelName: hotelSelect.value,
        question: questionInput.value,
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setStatus(body.error || "The question could not be answered.");
      return;
    }
    renderResult(body);
  } catch (error) {
    setStatus(
      error instanceof Error
        ? error.message
        : "The question could not be answered.",
    );
  } finally {
    askButton.disabled = false;
  }
});

loadHotels();
