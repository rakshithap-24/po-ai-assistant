const USASPENDING_AWARD_SEARCH_URL =
  "https://api.usaspending.gov/api/v2/search/spending_by_award/";

async function fetchLiveProcurementAwards(limit = 50, page = 1) {
  const payload = {
    filters: {
      time_period: [
        {
          start_date: "2025-01-01",
          end_date: "2026-12-31"
        }
      ],
      award_type_codes: ["A", "B", "C", "D"]
    },
    fields: [
      "Award ID",
      "Recipient Name",
      "Description",
      "Award Amount",
      "Awarding Agency",
      "Start Date",
      "End Date"
    ],
    page,
    limit,
    sort: "Award Amount",
    order: "desc",
    subawards: false
  };

  const response = await fetch(USASPENDING_AWARD_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `USAspending API failed. HTTP ${response.status}: ${errorText}`
    );
  }

  const data = await response.json();

  if (!data.results || !Array.isArray(data.results)) {
    throw new Error("USAspending API response did not contain results.");
  }

  return data.results;
}

module.exports = {
  fetchLiveProcurementAwards
};