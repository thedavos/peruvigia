import { classifySanction } from "./classification.js";

test("classifySanction prioritizes explicit status over dates", () => {
  const result = classifySanction({
    endDate: "2026-12-31",
    family: "ley_31288",
    reportDate: "2026-03-27",
    startDate: "2026-01-01",
    statusRaw: "No vigente",
  });

  expect(result.signalType).toBe("contraloria_sanction_historical");
  expect(result.statusReason).toBe("explicit");
  expect(result.isActive).toBe(false);
});

test("classifySanction derives active status from dates", () => {
  const result = classifySanction({
    endDate: "2026-12-31",
    family: "ley_29622",
    reportDate: "2026-03-27",
    startDate: "2026-01-01",
    statusRaw: null,
  });

  expect(result.signalType).toBe("contraloria_sanction_active");
  expect(result.statusReason).toBe("dates");
  expect(result.isActive).toBe(true);
});

test("classifySanction keeps unknown context out of active score factors", () => {
  const result = classifySanction({
    endDate: null,
    family: "ley_29622",
    reportDate: "2026-03-27",
    startDate: null,
    statusRaw: null,
  });

  expect(result.signalType).toBe("contraloria_sanction_unknown_context");
  expect(result.statusReason).toBe("unknown");
  expect(result.isActive).toBe(false);
});
