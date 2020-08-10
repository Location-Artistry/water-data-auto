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

//Endpoint to generate Sampling Plan Doc, passed params: sheetID, DocID
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
    
    //sheetId = 1l-A50ZJT2iK3Sby9KAU3oQ-SOW0OtmR1saA1x11suZo docID = 1pi6nwCDIZn6PTRB8ygqw87jAkyoId1Rgjs3-UMnPCAU
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
            'probeSamJul6':row[15],'probeSamAug7':row[16], 'probeSamSep8':row[17], 'probeSamOct9':row[18], 'probeSiteYear':row[21],'probeTotSamp':row[22],
            'labSiteEcoli':row[23], 'labSiteNit':row[25],'labSitePhos':row[27]};
            rowArray[x] = rowRecord;
            x++;
          }
        return rowArray; 
      };

      //generate additional information based on results of sampling sheet array
      //Loops through station rows from Sheet data to generate number of sites in wateshed etc... 8-10-2020
      async function samplingData(sheetsData) {
        let sampData = {'sitesNum':0,'pineNum':0,'pineSites':[],'nottNum':0,'nottSites':[],'labNum':0,'labSites':[],
                        'mayProbe':0,'junProbe':0,'julProbe':0,'augProbe':0,'sepProbe':0,'octProbe':0,'ecoliSamp':0,'phosSamp':0,'nitSamp':0};
        for (site of sheetsData){
          sampData.sitesNum = Number(site.probeSiteYear) != 0 ? (sampData.sitesNum + 1) : sampData.sitesNum;
          Number(site.probeSiteYear) != 0 ? (site.watershed == "PINE CREEK" ? 
            ((sampData.pineNum = sampData.pineNum+1),(sampData.pineSites.push(' ' + site.siteID))) : ("")):("");
          Number(site.probeSiteYear) != 0 ? (site.watershed == "NOTTAWA CREEK" ? 
            ((sampData.nottNum = sampData.nottNum+1),(sampData.nottSites.push(' ' + site.siteID))) : ("")):("");
          Number(site.labSiteEcoli) != 0 ? 
            ( (sampData.labNum = sampData.labNum+1) , (sampData.labSites.push(' ' + site.siteID) )) : ("");
          //months of probe sample numbers
          sampData.mayProbe = Number(site.probeSamMay4) != 0 ? (sampData.mayProbe + Number(site.probeSamMay4)) : sampData.mayProbe;
          sampData.junProbe = Number(site.probeSamJun5) != 0 ? (sampData.junProbe + Number(site.probeSamJun5)) : sampData.junProbe;
          sampData.julProbe = Number(site.probeSamJul6) != 0 ? (sampData.julProbe + Number(site.probeSamJul6)) : sampData.julProbe;
          sampData.augProbe = Number(site.probeSamAug7) != 0 ? (sampData.augProbe + Number(site.probeSamAug7)) : sampData.augProbe;
          sampData.sepProbe = Number(site.probeSamSep8) != 0 ? (sampData.sepProbe + Number(site.probeSamSep8)) : sampData.sepProbe;
          sampData.octProbe = Number(site.probeSamOct9) != 0 ? (sampData.octProbe + Number(site.probeSamOct9)) : sampData.octProbe;
          //counts for the lab parameters
          sampData.ecoliSamp = Number(site.labSiteEcoli) != 0 ? (sampData.ecoliSamp + Number(site.labSiteEcoli)) : sampData.ecoliSamp;
          sampData.phosSamp = Number(site.labSitePhos) != 0 ? (sampData.phosSamp + Number(site.labSitePhos)) : sampData.phosSamp;
          sampData.nitSamp = Number(site.labSiteNit) != 0 ? (sampData.nitSamp + Number(site.labSiteNit)) : sampData.nitSamp;
          console.log('phosphorus: ' + site.labSitePhos, sampData.phosSamp);
          console.log('nitrogen: ' + site.labSiteNit, sampData.nitSamp);
        }
        return sampData;
      }
      
      //now insert the function to send data to the water quality G Docs!
      async function updateDoc(auth, sheetsArray, suppData) { 
        const currentYear = ((new Date()).getFullYear()).toString();
        const keyPath = `https://docs.googleapis.com/$discovery/rest?version=v1&key=${firebaseConfig.apiKey}`;
        let requests = [
          { replaceAllText: { containsText: { text: '{{YEAR}}', matchCase: true, }, replaceText: currentYear, },},
          { replaceAllText: { containsText: { text: '{{TOTAL-SITES}}', matchCase: true, }, replaceText: (suppData.sitesNum).toString(), },},
          { replaceAllText: { containsText: { text: '{{PINE-NUM}}', matchCase: true, }, replaceText: (suppData.pineNum).toString(), },},  
          { replaceAllText: { containsText: { text: '{{PINE-CREEK-SITES}}', matchCase: true, }, replaceText: (suppData.pineSites).toString(), },},
          { replaceAllText: { containsText: { text: '{{NOTT-NUM}}', matchCase: true, }, replaceText: (suppData.nottNum).toString(), },},
          { replaceAllText: { containsText: { text: '{{NOTTAWA-CREEK-SITES}}', matchCase: true, }, replaceText: (suppData.nottSites).toString(), },},
          { replaceAllText: { containsText: { text: '{{LAB-SITES-NUM}}', matchCase: true, }, replaceText: (suppData.labNum).toString(), },},
          { replaceAllText: { containsText: { text: '{{LAB-SITES}}', matchCase: true, }, replaceText: (suppData.labSites).toString(), },},
          { replaceAllText: { containsText: { text: '{{MAY-SAMP-NUM}}', matchCase: true, }, replaceText: (suppData.mayProbe).toString(), },},
          { replaceAllText: { containsText: { text: '{{JUN-SAMP-NUM}}', matchCase: true, }, replaceText: (suppData.junProbe).toString(), },},
          { replaceAllText: { containsText: { text: '{{JUL-SAMP-NUM}}', matchCase: true, }, replaceText: (suppData.julProbe).toString(), },},
          { replaceAllText: { containsText: { text: '{{AUG-SAMP-NUM}}', matchCase: true, }, replaceText: (suppData.augProbe).toString(), },},
          { replaceAllText: { containsText: { text: '{{SEP-SAMP-NUM}}', matchCase: true, }, replaceText: (suppData.sepProbe).toString(), },},
          { replaceAllText: { containsText: { text: '{{OCT-SAMP-NUM}}', matchCase: true, }, replaceText: (suppData.octProbe).toString(), },},
          { replaceAllText: { containsText: { text: '{{ECOLI-SAMP-NUM}}', matchCase: true, }, replaceText: (suppData.ecoliSamp).toString(), },},
          { replaceAllText: { containsText: { text: '{{PHOS-SAMP-NUM}}', matchCase: true, }, replaceText: (suppData.phosSamp).toString(), },},
          { replaceAllText: { containsText: { text: '{{NIT-SAMP-NUM}}', matchCase: true, }, replaceText: (suppData.nitSamp).toString(), },},
          { replaceAllText: { containsText: { text: '{{BODY-TEXT-1-1}}', matchCase: true, }, replaceText: itemIDs[1], },}, 
        ];
        //console.log(`keyPath: ${keyPath}`);
        //console.log(requests);
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
      const dataFormat = await rowsToObjects(sheetData);
      const dataInfo = await samplingData(dataFormat);
      const runUpdate = await updateDoc(auth, dataFormat, dataInfo);
      //console.log(runUpdate);
      res
      .set('Access-Control-Allow-Origin', '*')
      .status(200)
      .send(dataFormat);
  } //end of generate report function
  } catch (error) {
    console.log('You had better err on the side of caution...ERROR');
  }  
}); 


exports.api = functions.runWith({ memory: '1GB' }).https.onRequest(app);  