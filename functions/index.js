require('dotenv').config();
const firebaseConfig = {
  apiKey: process.env.apiKey,
  authDomain: process.env.authDomain,
  databaseURL: process.env.databaseURL,
  projectId: process.env.projectId,
  storageBucket: process.env.storageBucket,
  messagingSenderId: process.env.messagingSenderId,
  appId: process.env.appId,
  measurementId: process.env.measurementId
};
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(firebaseConfig);
const {google} = require('googleapis');
const fetch = require('node-fetch');
const express = require('express');
const fs = require('fs');
const readline = require('readline');
const cors = require('cors');
const app = express();
app.use(cors({ origin: true }));

//ANOTHER new function to test out changing access methods simiar to indexDrive.js
app.get("/formatWaterDoc/:sheetDocIDs", async (req, res) => {
  try {
     //auth sequence, must be run from function currently
     const SCOPES = ['https://www.googleapis.com/auth/documents','https://www.googleapis.com/auth/spreadsheets'];
     const TOKEN_PATH = 'token.json';
     // Load client secrets from a local file.
     fs.readFile('credentials.json', (err, content) => {
       if (err) return console.log('Error loading client secret file:', err);
         // Authorize a client with credentials, then call the Google Docs API.        
         authorize(JSON.parse(content), generateReport);
       }); 
     function authorize(credentials, callback) {
       const {client_secret, client_id, redirect_uris} = credentials.installed;
       const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
       // Check if we have previously stored a token.
       fs.readFile(TOKEN_PATH, (err, token) => {
       if (err) return getNewToken(oAuth2Client, callback);
         oAuth2Client.setCredentials(JSON.parse(token));
         callback(oAuth2Client);
       });
     }
     //end of auth sequence phew!!!
    
    //sheetId = 1l-A50ZJT2iK3Sby9KAU3oQ-SOW0OtmR1saA1x11suZo docID = 1dOgh7Vn6SZ5qy0MEJmLTJ4m1FAhRROvvPNdo6gBSOho
    //pass the Gsuite item ids in as comma separated values in an array  
    const itemIDs = req.params.sheetDocIDs.split(',');
    //primary function, authorized above, all action in happening in here, function calls below 
    
    async function generateReport(auth){
      //setup authorized connection to google services
      const sheets = google.sheets({version: 'v4', auth});
      const docs = google.docs({version: 'v1', auth});   
      //get data from sheet, return as response object, response.values contain array of row objects
      
      async function getSheetData() {
        const request = {
          auth: auth, spreadsheetId: itemIDs[0], range: 'DATA!A2:AK'
        };
        try {
          const response = (await sheets.spreadsheets.values.get(request)).data;
          return response.values;
        } catch (err) {
          console.error(err);
        }
      }
      //formats response.values array into array of objects
      async function rowsToObjects(sheetRows) {
        let rowArray = [], rowRecord = {}, x = 0;
          for (const row of sheetRows) {
            rowRecord = {'siteID':row[0],'siteName':row[1],'waterbody':row[2],'watershed':row[3],'probeSamMay4':row[13],'probeSamJun5':row[14],
            'probeSamJul6':row[15],'probeSamAug7':row[16], 'probeSamSep8':row[17], 'probeSamOct9':row[18], 'probeSiteYear':row[21],'probeTotSamp':row[22]};
            rowArray[x] = rowRecord;
            x++;
          }
        return rowArray; 
      };
      
      //now insert the function to send data to the water quality G Docs!
      async function updateDoc(auth, sheetsArray) { 
        const currentYear = ((new Date()).getFullYear()).toString();
        const keyPath = `https://docs.googleapis.com/$discovery/rest?version=v1&key=${firebaseConfig.apiKey}`;
        let requests = [
          { replaceAllText: { containsText: { text: '{{YEAR}}', matchCase: true, }, replaceText: currentYear, },},
          { replaceAllText: { containsText: { text: '{{SITE-ID}}', matchCase: true, }, replaceText: sheetsArray[0].siteID, },},
          { replaceAllText: { containsText: { text: '{{WATERBODY}}', matchCase: true, }, replaceText: sheetsArray[0].waterbody, },},
          { replaceAllText: { containsText: { text: '{{WATERSHED}}', matchCase: true, }, replaceText: sheetsArray[0].watershed, },},
          { replaceAllText: { containsText: { text: '{{TOTSITESAMP}}', matchCase: true, }, replaceText: sheetsArray[0].probeSiteYear, },},
          { replaceAllText: { containsText: { text: '{{TOTPROBESAMP}}', matchCase: true, }, replaceText: sheetsArray[0].probeTotSamp, },},
          { replaceAllText: { containsText: { text: '{{BODY-TEXT-1-1}}', matchCase: true, }, replaceText: itemIDs[1], },}, 
        ];
        //console.log(`keyPath: ${keyPath}`);
        console.log(requests);

        google.options({auth: auth});
        google
            .discoverAPI(keyPath)
            .then(function(docs) {
              docs.documents.batchUpdate(
                  { documentId: itemIDs[1], resource: { requests, },},
                  (err, data) => {
                    if (err) return console.log('The API returned an error: ' + err);
                    //console.log(data);
                  });
            });
      };
    
    

      //this is the business logic so to speak, brings in the data and formats the object, func declarations and auth above
      const sheetData = await getSheetData();
      const sheetDataFinal = await rowsToObjects(sheetData);
      const runUpdate = await updateDoc(auth, sheetDataFinal);
      //console.log(runUpdate);
      res
      .set('Access-Control-Allow-Origin', '*')
      .status(200)
      .send(sheetDataFinal);
  } //end of generate report function
  } catch (error) {
    console.log('You had better err on the side of caution...ERROR');
  }  
}); 


exports.api = functions.runWith({ memory: '1GB' }).https.onRequest(app);