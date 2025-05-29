const { google } = require('googleapis');

// Load credentials from environment variable
// IMPORTANT: Ensure GOOGLE_SERVICE_ACCOUNT_CREDENTIALS is set as an environment variable in Netlify
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS);
const spreadsheetId = '1pnS9Gb9YB_TuCTeNU3dlQFcVRaiah9F6fYMrL5luGls'; // REPLACE THIS WITH YOUR ACTUAL GOOGLE SHEET ID

// Initialize Google Auth (Service Account)
const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

exports.handler = async function(event, context) {
    // Handle preflight OPTIONS request for CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*', // Allows all origins. For production, specify your Netlify domain.
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400', // Cache preflight for 24 hours
            },
            body: '',
        };
    }

    const sheets = google.sheets({ version: 'v4', auth });
    const { queryStringParameters, httpMethod, body } = event;

    try {
        const sheetName = queryStringParameters.sheet; // e.g., 'Users', 'Students', 'Attendance'

        if (!sheetName) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Sheet name is required.' }) };
        }

        let responseData;

        if (httpMethod === 'GET') {
            const range = `${sheetName}!A:Z`; // Fetch entire sheet for filtering
            const result = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range,
            });
            
            const rows = result.data.values;
            if (!rows || rows.length === 0) {
                responseData = []; // No data rows
            } else {
                const headers = rows[0];
                const dataRows = rows.slice(1);
                responseData = dataRows.map(row => {
                    let obj = {};
                    headers.forEach((header, i) => {
                        obj[header] = row[i];
                    });
                    return obj;
                });
                
                // Apply query parameters as filters (similar to Apps Script doGet)
                for (const key in queryStringParameters) {
                    if (key !== 'sheet' && headers.includes(key)) { // Only filter by valid headers
                        responseData = responseData.filter(item => 
                            String(item[key]) === String(queryStringParameters[key])
                        );
                    }
                }
            }
        } else if (httpMethod === 'POST') {
            const parsedBody = JSON.parse(body);
            const records = parsedBody.data; // Expects { data: [...] }

            if (!records || records.length === 0) {
                return { statusCode: 400, body: JSON.stringify({ error: 'No data provided for POST.' }) };
            }

            // Get headers from the sheet to ensure correct column order
            const headerResult = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `${sheetName}!1:1`, // Get first row (headers)
            });
            const headers = headerResult.data.values[0];

            const valuesToAppend = records.map(record => {
                const row = [];
                headers.forEach(header => {
                    row.push(record[header] !== undefined ? record[header] : '');
                });
                return row;
            });

            const appendResult = await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: `${sheetName}!A1`, // Append starting from A1 (after headers)
                valueInputOption: 'RAW', // Insert values as is
                insertDataOption: 'INSERT_ROWS', // Insert new rows
                resource: {
                    values: valuesToAppend,
                },
            });
            responseData = { created: appendResult.data.updates.updatedRows };

        } else if (httpMethod === 'PUT') {
            const parsedBody = JSON.parse(body);
            const searchColumn = queryStringParameters.searchColumn;
            const searchValue = queryStringParameters.searchValue;

            if (!searchColumn || !searchValue) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Search column and value are required for PUT.' }) };
            }

            // Get all data to find the row to update
            const allDataResult = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `${sheetName}!A:Z`, 
            });
            const allRows = allDataResult.data.values;
            if (!allRows || allRows.length === 0) {
                return { statusCode: 404, body: JSON.stringify({ error: 'Sheet is empty or search value not found.' }) };
            }

            const headers = allRows[0];
            const searchColIndex = headers.indexOf(searchColumn);
            if (searchColIndex === -1) {
                return { statusCode: 400, body: JSON.stringify({ error: `Search column '${searchColumn}' not found in sheet headers.` }) };
            }

            let rowIndexToUpdate = -1;
            for (let i = 1; i < allRows.length; i++) { // Start from 1 to skip headers
                if (String(allRows[i][searchColIndex]) === String(searchValue)) {
                    rowIndexToUpdate = i; // 0-based index of the data row
                    break;
                }
            }

            if (rowIndexToUpdate === -1) {
                return { statusCode: 404, body: JSON.stringify({ error: `Record with ${searchColumn}=${searchValue} not found.` }) };
            }

            // Prepare updated row values based on original row and parsedBody
            const existingRow = allRows[rowIndexToUpdate];
            const updatedRow = [...existingRow]; // Copy to modify

            for (const key in parsedBody) {
                const colIndex = headers.indexOf(key);
                if (colIndex !== -1) {
                    updatedRow[colIndex] = parsedBody[key];
                }
            }

            // Update the row
            const updateRange = `${sheetName}!A${rowIndexToUpdate + 1}`; // +1 to convert to 1-based sheet row
            const updateResult = await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: updateRange,
                valueInputOption: 'RAW',
                resource: {
                    values: [updatedRow],
                },
            });
            responseData = { updated: updateResult.data.updatedRows };
        } else {
            return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed.' }) };
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*', // Allow all origins for development
            },
            body: JSON.stringify(responseData),
        };
    } catch (error) {
        console.error('Netlify Function Error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*', // Allow all origins for development
            },
            body: JSON.stringify({ error: error.message || 'Internal Server Error' }),
        };
    }
};
