function doPost(e) {
  try {
    var raw = (e.parameter && e.parameter.data) ? e.parameter.data : e.postData.contents;
    var data = JSON.parse(raw);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var colCount = 10;
    var isNewSheet = sheet.getLastRow() === 0;

    if (isNewSheet) {
      var headers = ['Timestamp', 'First Name', 'Last Name', 'Date', 'Journey Name', 'Distance', 'Duration', 'Notes', 'Called Away', 'Route Map'];
      var hr = sheet.getRange(1, 1, 1, colCount);
      hr.setValues([headers]);
      hr.setFontWeight('bold');
      hr.setBackground('#0a1628');
      hr.setFontColor('#ffffff');
      hr.setHorizontalAlignment('center');
      hr.setVerticalAlignment('middle');
      hr.setFontSize(10);
      sheet.setFrozenRows(1);
      sheet.setRowHeight(1, 30);
      [170, 120, 120, 110, 200, 90, 90, 380, 380, 120].forEach(function(w, i) { sheet.setColumnWidth(i + 1, w); });
    } else {
      var existingCols = sheet.getLastColumn();
      if (existingCols < colCount) {
        sheet.getRange(1, existingCols + 1, 1, colCount - existingCols).setValues([['Route Map']]);
        sheet.getRange(1, existingCols + 1, 1, colCount - existingCols).setFontWeight('bold');
        sheet.getRange(1, existingCols + 1, 1, colCount - existingCols).setBackground('#0a1628');
        sheet.getRange(1, existingCols + 1, 1, colCount - existingCols).setFontColor('#ffffff');
        sheet.getRange(1, existingCols + 1, 1, colCount - existingCols).setHorizontalAlignment('center');
        sheet.getRange(1, existingCols + 1, 1, colCount - existingCols).setFontSize(10);
        sheet.setColumnWidth(10, 120);
      }
    }

    sheet.insertRowBefore(2);
    var newRow = sheet.getRange(2, 1, 1, 9);
    newRow.setValues([[
      new Date(),
      data.firstName || '',
      data.lastName || '',
      data.date || '',
      data.name || '',
      data.distance || '',
      data.duration || '',
      data.notes || '',
      data.waypoints || '',
    ]]);
    newRow.getCell(1, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
    newRow.getCell(1, 4).setNumberFormat('dd/mm/yyyy');
    newRow.setVerticalAlignment('middle');
    newRow.setFontSize(10);
    sheet.setRowHeight(2, 130);

    if (data.routeImage) {
      var base64 = data.routeImage.replace(/^data:image\/png;base64,/, '');
      var imageBlob = Utilities.newBlob(Utilities.base64Decode(base64), 'image/png', 'route.png');
      sheet.insertImage(imageBlob, 2, 10);
    }

    var lastRow = sheet.getLastRow();
    var dataRange = sheet.getRange(1, 1, lastRow, 9);
    dataRange.setBorder(true, true, true, true, true, true, '#c8d0da', SpreadsheetApp.BorderStyle.SOLID_THIN);

    var existingBandings = sheet.getBandings();
    for (var b = 0; b < existingBandings.length; b++) {
      existingBandings[b].remove();
    }
    var banding = dataRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY);
    banding.setHeaderBackgroundColor('#0a1628');
    banding.setHeaderFontColor('#ffffff');
    banding.setFirstRowBackgroundColor('#ffffff');
    banding.setSecondRowBackgroundColor('#f0f4fa');

    sheet.getRange(2, 8, lastRow - 1, 2).setWrap(true);

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
