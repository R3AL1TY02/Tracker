/* ============================================================
   Google Apps Script — Journey Tracker Web App
   ============================================================
   How to deploy:
   1. Go to https://sheets.new to create a new Google Sheet
   2. Rename the sheet tab at the bottom to "Journeys"
   3. In row 1, add these headers:
      Timestamp | First Name | Last Name | Date | Journey Name |
      Distance | Distance (m) | Duration | Duration (s) |
      Avg Speed | Max Speed | Avg Speed (m/s) | Max Speed (m/s) |
      Points | Start Time | End Time |
      Start Lat | Start Lng | Finish Lat | Finish Lng | Notes
   4. Go to Extensions → Apps Script
   5. Paste this entire file, replacing the default Code.gs
   6. Click Deploy → New Deployment → Web App
   7. Set "Execute as" = Me, "Who has access" = Anyone
   8. Click Deploy, copy the Web App URL
   9. Paste that URL into the Journey Tracker Settings page
   ============================================================ */

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Journeys');

    if (!sheet) {
      throw new Error('Sheet "Journeys" not found. Rename your sheet tab to "Journeys".');
    }

    sheet.appendRow([
      new Date(),                          // Timestamp
      data.firstName || '',                // First Name
      data.lastName || '',                 // Last Name
      data.date || '',                     // Date
      data.name || '',                     // Journey Name
      data.distance || '',                 // Distance
      data.distanceMeters || '',           // Distance (m)
      data.duration || '',                 // Duration
      data.durationSeconds || '',          // Duration (s)
      data.avgSpeed || '',                 // Avg Speed
      data.maxSpeed || '',                 // Max Speed
      data.avgSpeedMs || '',               // Avg Speed (m/s)
      data.maxSpeedMs || '',               // Max Speed (m/s)
      data.points || '',                   // Points
      data.startTime || '',                // Start Time
      data.endTime || '',                  // End Time
      data.startLat || '',                 // Start Lat
      data.startLng || '',                 // Start Lng
      data.finishLat || '',                // Finish Lat
      data.finishLng || '',                // Finish Lng
      data.notes || '',                    // Notes
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return HtmlService.createHtmlOutput('Journey Tracker Google Sheets Web App is running.');
}
