function doPost(e) {
  try {
    const raw = (e.parameter && e.parameter.data) ? e.parameter.data : e.postData.contents;
    const data = JSON.parse(raw);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    const numCols = 8;

    if (sheet.getLastRow() === 0) {
      const headers = ['Timestamp', 'First Name', 'Last Name', 'Date', 'Journey Name', 'Distance', 'Duration', 'Notes'];
      const hr = sheet.getRange(1, 1, 1, numCols);
      hr.setValues([headers]);
      hr.setFontWeight('bold');
      hr.setBackground('#0a1628');
      hr.setFontColor('#ffffff');
      hr.setHorizontalAlignment('center');
      hr.setVerticalAlignment('middle');
      hr.setFontSize(11);
      sheet.setFrozenRows(1);
      sheet.setRowHeight(1, 32);
      [180, 130, 130, 120, 220, 100, 100, 400].forEach((w, i) => sheet.setColumnWidth(i + 1, w));
    }

    sheet.insertRowBefore(2);
    const newRow = sheet.getRange(2, 1, 1, numCols);
    newRow.setValues([[
      new Date(),
      data.firstName || '',
      data.lastName || '',
      data.date || '',
      data.name || '',
      data.distance || '',
      data.duration || '',
      data.notes || '',
    ]]);
    newRow.getCell(1, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
    newRow.getCell(1, 4).setNumberFormat('dd/mm/yyyy');
    newRow.setVerticalAlignment('middle');

    const lastRow = sheet.getLastRow();
    const allRange = sheet.getRange(1, 1, lastRow, numCols);
    allRange.setBorder(true, true, true, true, true, true, '#d0d7e0', SpreadsheetApp.BorderStyle.SOLID_THIN);

    for (let r = 2; r <= lastRow; r++) {
      const row = sheet.getRange(r, 1, 1, numCols);
      row.setBackground(r % 2 === 0 ? '#ffffff' : '#edf2f9');
      row.setFontSize(10);
    }

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
  return HtmlService.createHtmlOutput('Journey Tracker Web App is running.');
}
