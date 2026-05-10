sap.ui.define([
  "sap/m/MessageToast",
  "sap/m/MessageBox"
], function (MessageToast, MessageBox) {
  "use strict";

  return {
    importLiveProcurementData: async function () {
      const limit = 50;

      MessageToast.show("Importing next 50 live procurement records...");

      try {
        const response = await fetch("/odata/v4/po/importLiveProcurementData", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            limit
          })
        });

        const result = await response.json();

        if (!response.ok) {
          const errorMessage =
            result?.error?.message ||
            result?.message ||
            "Live procurement import failed.";

          throw new Error(errorMessage);
        }

        const data = result.value && !Array.isArray(result.value)
          ? result.value
          : result;

        MessageBox.success(
          `${data.message || "Live procurement import completed."}\n\n` +
          `New Records Inserted: ${data.insertedCount ?? 0}\n` +
          `Duplicates Skipped: ${data.duplicateSkippedCount ?? 0}\n` +
          `Invalid Records Skipped: ${data.invalidSkippedCount ?? 0}\n` +
          `Pages Processed: ${data.startPage ?? "-"} - ${data.endPage ?? "-"}\n` +
          `Next Page: ${data.nextPage ?? "-"}\n\n` +
          `Click OK to refresh the Purchase Orders table.`,
          {
            onClose: function () {
              window.location.reload();
            }
          }
        );
      } catch (error) {
        console.error("Live procurement import failed:", error);

        MessageBox.error(
          `Live procurement import failed.\n\n${error.message}`
        );
      }
    }
  };
});