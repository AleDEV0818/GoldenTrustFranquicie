import { pool } from "../config/dbConfig.js";
import ExcelJS from "exceljs";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";

dotenv.config();

// ---------------- CONFIG ----------------
const ACTIVE_ONLY = true;
const IGNORE_DATE_RANGE = true;

const LOGO_PX_W = 360;
const LOGO_PX_H = 120;
const LOGO_COL_START = 1;       // A
const LOGO_COL_END   = 4;       // D
const TEXT_START_COL = LOGO_COL_END + 1;   // E
const SUMMARY_TEXT_LAST_COL = 6;          // F (explicitly requested)
const PANEL_ROWS = 5;
const TABLE_START_ROW = 6;      // Header row for any table
const LOGO_TIGHT = false;
const INDENT_TEXT = 0;

// Colors / styles
const PANEL_BG_COLOR     = "FFFFFFFF";
const PANEL_BORDER_COLOR = "FFCDD5DC";
const HEADER_BG          = "FF0F3D5C";
const HEADER_FG          = "FFFFFFFF";
const ROW_ZEBRA          = "FFF2F6FA";
const BORDER_COLOR       = "FFDDDDDD";
const KPI_BLUE_BG        = "FFD6E6FA";
const KPI_BLUE_TEXT      = "FF0B3D91";
const KPI_RED_BG         = "FFF8D7DA";
const KPI_RED_TEXT       = "FFB02A37";

const TEXT_TITLE_FONT  = { bold:true, size:16, color:{argb:"FF0F3D5C"} };
const TEXT_SUB_FONT    = { bold:true, size:12, color:{argb:"FF64748B"} };
const TEXT_PERIOD_FONT = { size:11,  color:{argb:"FF64748B"} };

const ACTIVE_LABELS = (process.env.ACTIVE_LABELS || "A,ACTIVE,INFORCE,IN FORCE,IN-FORCE,CURRENT")
  .split(",").map(s => s.trim().toUpperCase()).filter(Boolean);

// Email config
const EMAIL_TRANSPORT_OPTIONS = {
  service: process.env.EMAIL_SERVICE || "gmail",
  auth: {
    user: process.env.G_EMAIL,
    pass: process.env.G_PASSWORD
  }
};
const EMAIL_FROM = process.env.G_EMAIL;
const EMAIL_TO = (process.env.REPORT_EMAIL_TO || "eramos@goldentrust.com ")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean)
  .join(",");

const EMAIL_SUBJECT_PREFIX = process.env.REPORT_EMAIL_SUBJECT_PREFIX || "";

// ---------------- UTILITIES ----------------
function toISODate(date){ return date.toISOString().split("T")[0]; }
function getRange(){
  const now=new Date();
  const start=new Date(now.getFullYear(), now.getMonth(), 1); start.setHours(0,0,0,0);
  const end=new Date(now.getFullYear(), now.getMonth(), now.getDate()); end.setHours(0,0,0,0);
  return { startISO: toISODate(start), endISO: toISODate(end) };
}
function prettyPeriod(startISO, endISO){
  if(IGNORE_DATE_RANGE && ACTIVE_ONLY) return "All time (Active)";
  if(IGNORE_DATE_RANGE) return "All time";
  return `${startISO} to ${endISO}`;
}
function cleanSheetName(name){ return name.replace(/[*?:\\/\[\]]/g,""); }
function sanitizeFilename(n,fallback="location"){
  const base=(n||fallback).toString().trim();
  return base.replace(/\s+/g,"-").replace(/[^a-zA-Z0-9._-]/g,"").replace(/-+/g,"-");
}
function parseArg(flag){
  const i=process.argv.indexOf(flag);
  return i>=0 ? process.argv[i+1] : null;
}
function colToLetter(col){
  let temp="", n=col;
  while(n>0){ const rem=(n-1)%26; temp=String.fromCharCode(65+rem)+temp; n=(n-rem-1)/26; }
  return temp;
}

// ---------------- LOGO RESOLUTION ----------------
const LOGO_DIRS_REL=["assets/img/logo","assets/img/branding","assets/img"];
const LOGO_CANDIDATE_NAMES=[
  "Goldentrust.svg","Goldentrust.png","Goldentrust-Logo-(Final).png","GoldenTrust-Logo-(Final).png","logo.png"
];
function findProjectRoot(fromDir){
  let dir=fromDir;
  for(let i=0;i<8;i++){
    if(fs.existsSync(path.join(dir,"package.json"))||fs.existsSync(path.join(dir,".git"))) return dir;
    const parent=path.dirname(dir);
    if(parent===dir) break;
    dir=parent;
  }
  return fromDir;
}
function resolveLogoPathRelativeToProject(){
  const __filename=fileURLToPath(import.meta.url);
  const __dirname=path.dirname(__filename);
  const root=findProjectRoot(__dirname);
  const envRel=(process.env.REPORT_LOGO_RELATIVE||"").trim();
  if(envRel){
    const p=path.resolve(root, envRel);
    if(fs.existsSync(p)) return p;
    if(process.env.REPORT_LOGO_DEBUG==="true") console.warn("[REPORT] REPORT_LOGO_RELATIVE not found:", p);
  }
  for(const d of LOGO_DIRS_REL){
    for(const n of LOGO_CANDIDATE_NAMES){
      const p=path.join(root,d,n);
      if(fs.existsSync(p)) return p;
    }
  }
  return null;
}
async function normalizeLogo(absPath){
  const MAX_W=Number(process.env.REPORT_LOGO_MAX_W||800);
  const MAX_H=Number(process.env.REPORT_LOGO_MAX_H||240);
  const input=fs.readFileSync(absPath);
  const buffer=await sharp(input)
    .flatten({background:"#FFFFFF"})
    .resize({width:MAX_W,height:MAX_H,fit:"inside",withoutEnlargement:true})
    .png({quality:92,compressionLevel:9})
    .toBuffer();
  return buffer;
}
async function addWorkbookLogo(workbook){
  try{
    const abs=resolveLogoPathRelativeToProject();
    if(!abs){
      console.warn("[REPORT] Logo not found.");
      return null;
    }
    const buffer=await normalizeLogo(abs);
    return workbook.addImage({ buffer, extension:"png" });
  }catch(e){
    console.warn("[REPORT] Logo load error:", e?.message||e);
    return null;
  }
}

// ---------------- PANEL HELPERS ----------------
function calcLogoColWidthChars(){
  const cols=LOGO_COL_END-LOGO_COL_START+1;
  let perCol = (LOGO_PX_W / cols - 5)/7;
  if(LOGO_TIGHT) perCol -= 0.8;
  return Math.max(7, Math.round(perCol));
}
function drawBox(ws,{startCol,endCol,startRow=1,endRow=PANEL_ROWS,fillColor=PANEL_BG_COLOR,borderColor=PANEL_BORDER_COLOR}){
  for(let r=startRow;r<=endRow;r++){
    for(let c=startCol;c<=endCol;c++){
      const cell=ws.getCell(r,c);
      cell.fill={ type:"pattern", pattern:"solid", fgColor:{argb:fillColor} };
      cell.border={
        top:   { style: r===startRow?"thin":"none", color:{argb:borderColor} },
        bottom:{ style: r===endRow  ?"thin":"none", color:{argb:borderColor} },
        left:  { style: c===startCol?"thin":"none", color:{argb:borderColor} },
        right: { style: c===endCol  ?"thin":"none", color:{argb:borderColor} }
      };
    }
  }
}

/**
 * createPanel
 * @param {Worksheet} ws
 * @param {string} franchiseName
 * @param {string} periodLabel
 * @param {number|null} logoId
 * @param {{showText:boolean}} options
 * @returns {number} table header row index (TABLE_START_ROW)
 */
function createPanel(ws, franchiseName, periodLabel, logoId, { showText=true }={}){
  // Insert panel rows (1..5)
  ws.spliceRows(1,0,...Array.from({length:PANEL_ROWS},()=>[]));
  for(let r=1;r<=PANEL_ROWS;r++) ws.getRow(r).height=22;

  // Set widths for logo columns
  const logoWidth=calcLogoColWidthChars();
  for(let c=LOGO_COL_START;c<=LOGO_COL_END;c++){
    const col=ws.getColumn(c);
    col.width=logoWidth;
    col.alignment={ horizontal:"left", vertical:"middle" };
  }

  // Draw logo box
  drawBox(ws,{ startCol:LOGO_COL_START, endCol:LOGO_COL_END });

  // Add logo
  if(logoId!=null){
    try{
      ws.addImage(logoId,{
        tl:{ col:LOGO_COL_START-1, row:0 },
        ext:{ width:LOGO_PX_W, height:LOGO_PX_H },
        editAs:"oneCell"
      });
    }catch(e){
      console.warn("[REPORT] Logo insert failed:", e?.message||e);
    }
  }

  if(showText){
    // Columns E..F
    for(let c=TEXT_START_COL;c<=SUMMARY_TEXT_LAST_COL;c++){
      const col=ws.getColumn(c);
      if(!col.width) col.width=20;
      col.alignment={ horizontal:"left", vertical:"middle" };
    }
    drawBox(ws,{ startCol:TEXT_START_COL, endCol:SUMMARY_TEXT_LAST_COL });

    const L=colToLetter(TEXT_START_COL);
    const R=colToLetter(SUMMARY_TEXT_LAST_COL);

    // Title line
    ws.mergeCells(`${L}1:${R}1`);
    const t1=ws.getCell(`${L}1`);
    t1.value="Franchise Errors Report";
    t1.font=TEXT_TITLE_FONT;
    t1.alignment={ horizontal:"left", vertical:"middle", indent:INDENT_TEXT };

    // Franchise line
    ws.mergeCells(`${L}2:${R}2`);
    const t2=ws.getCell(`${L}2`);
    t2.value=`Franchise: ${franchiseName}`;
    t2.font=TEXT_SUB_FONT;
    t2.alignment={ horizontal:"left", vertical:"middle", indent:INDENT_TEXT };

    // Period line
    ws.mergeCells(`${L}3:${R}3`);
    const t3=ws.getCell(`${L}3`);
    t3.value=`Period: ${periodLabel}`;
    t3.font=TEXT_PERIOD_FONT;
    t3.alignment={ horizontal:"left", vertical:"middle", indent:INDENT_TEXT };

    ws.__panelLastCol=SUMMARY_TEXT_LAST_COL;
  } else {
    // Only logo
    ws.__panelLastCol=LOGO_COL_END;
  }

  ws.pageSetup={ ...(ws.pageSetup||{}), printTitlesRow:`1:${PANEL_ROWS}` };
  return TABLE_START_ROW;
}

// ---------------- TABLE FORMATTING ----------------
function styleHeaderRow(ws, headerRowIdx){
  const headerRow=ws.getRow(headerRowIdx);
  headerRow.font={ bold:true, color:{argb:HEADER_FG} };
  headerRow.alignment={ horizontal:"center", vertical:"middle" };
  headerRow.height=22;

  // Determine last used col in header row
  let lastUsed=0;
  headerRow.eachCell({includeEmpty:false}, (cell,col)=>{
    if(cell.value!=null && cell.value!=="") lastUsed=Math.max(lastUsed,col);
  });

  for(let c=1;c<=lastUsed;c++){
    const cell=ws.getCell(headerRowIdx,c);
    cell.fill={ type:"pattern", pattern:"solid", fgColor:{argb:HEADER_BG} };
    cell.border={
      top:{style:"thin",color:{argb:BORDER_COLOR}},
      bottom:{style:"thin",color:{argb:BORDER_COLOR}},
      left:{style:"thin",color:{argb:BORDER_COLOR}},
      right:{style:"thin",color:{argb:BORDER_COLOR}}
    };
  }
}
function zebraAndBorders(ws, headerRowIdx){
  // Last header col
  let lastUsed=0;
  ws.getRow(headerRowIdx).eachCell({includeEmpty:false},(cell,col)=>{
    if(cell.value!=null && cell.value!=="") lastUsed=Math.max(lastUsed,col);
  });

  for(let r=headerRowIdx+1;r<=ws.rowCount;r++){
    const even=(r-headerRowIdx)%2===0;
    for(let c=1;c<=lastUsed;c++){
      const cell=ws.getCell(r,c);
      if(even) cell.fill={ type:"pattern", pattern:"solid", fgColor:{argb:ROW_ZEBRA} };
      cell.border={
        top:{style:"thin",color:{argb:BORDER_COLOR}},
        bottom:{style:"thin",color:{argb:BORDER_COLOR}},
        left:{style:"thin",color:{argb:BORDER_COLOR}},
        right:{style:"thin",color:{argb:BORDER_COLOR}}
      };
      cell.alignment={ horizontal:"center", vertical:"middle" };
    }
    ws.getRow(r).height=18;
  }
}
function autosizeDataColumns(ws, headerRowIdx){
  const panelLast=ws.__panelLastCol || LOGO_COL_END;
  const headerRow=ws.getRow(headerRowIdx);
  const lastRow=ws.rowCount;

  headerRow.eachCell({includeEmpty:false},(cell,c)=>{
    if(c<=panelLast) return;
    // Determine max length
    let maxChars=String(cell.value??"").length;
    for(let r=headerRowIdx+1;r<=lastRow;r++){
      const v=ws.getCell(r,c).value;
      if(v==null) continue;
      String(v).split(/\r?\n/).forEach(seg=>{
        if(seg.length>maxChars) maxChars=seg.length;
      });
    }
    const width=Math.min(Math.max(maxChars+2, 6), 80);
    ws.getColumn(c).width=width;
  });
}
function applyUniformAlignment(ws, headerRowIdx){
  let lastUsed=0;
  ws.getRow(headerRowIdx).eachCell({includeEmpty:false},(cell,col)=>{
    if(cell.value!=null && cell.value!=="") lastUsed=Math.max(lastUsed,col);
  });
  for(let r=headerRowIdx; r<=ws.rowCount; r++){
    for(let c=1;c<=lastUsed;c++){
      ws.getCell(r,c).alignment={ horizontal:"center", vertical:"middle" };
    }
  }
}
function formatTable(ws, headerRowIdx){
  autosizeDataColumns(ws, headerRowIdx);
  styleHeaderRow(ws, headerRowIdx);
  zebraAndBorders(ws, headerRowIdx);
  applyUniformAlignment(ws, headerRowIdx);
  ws.views=[{ state:"frozen", ySplit: headerRowIdx }];
}

// ---------------- SUMMARY (VERTICAL KPI) ----------------
function writeVerticalSummary(ws, summary, startRow){
  const rowsSpec=[
    { label:"Binder errors", key:"binder_errors" },
    { label:"Missing CSR", key:"csr_total" },
    { label:"Missing Producer", key:"producer_total" },
    { label:"Missing (any)", key:"missing_any_total" },
    { label:"Missing Contact Info", key:"missing_contact_info" },
    { label:"A. Policies", key:"active_policies", kpi:"blue" },
    { label:"A. Clients", key:"active_clients", kpi:"blue" },
    { label:"Total errors", key:"total_errors", kpi:"red" }
  ];

  const headerRow=ws.getRow(startRow);
  headerRow.getCell(1).value="Category";
  headerRow.getCell(2).value="Count";
  headerRow.font={ bold:true, color:{argb:HEADER_FG} };
  headerRow.alignment={ horizontal:"center", vertical:"middle" };
  headerRow.height=22;

  for(let c=1;c<=2;c++){
    const cell=headerRow.getCell(c);
    cell.fill={ type:"pattern", pattern:"solid", fgColor:{argb:HEADER_BG} };
    cell.border={
      top:{style:"thin",color:{argb:BORDER_COLOR}},
      bottom:{style:"thin",color:{argb:BORDER_COLOR}},
      left:{style:"thin",color:{argb:BORDER_COLOR}},
      right:{style:"thin",color:{argb:BORDER_COLOR}}
    };
    ws.getColumn(c).width=Math.max(ws.getColumn(c).width||0, c===1?26:14);
  }

  let r=startRow+1;
  rowsSpec.forEach((spec,i)=>{
    const row=ws.getRow(r);
    const labelCell=row.getCell(1);
    const valueCell=row.getCell(2);

    const val = Number.isFinite(Number(summary?.[spec.key])) ? Number(summary[spec.key]) : 0;

    labelCell.value=spec.label;
    valueCell.value=val;

    row.height=18;

    for(const cCell of [labelCell,valueCell]){
      cCell.border={
        top:{style:"thin",color:{argb:BORDER_COLOR}},
        bottom:{style:"thin",color:{argb:BORDER_COLOR}},
        left:{style:"thin",color:{argb:BORDER_COLOR}},
        right:{style:"thin",color:{argb:BORDER_COLOR}}
      };
    }
    labelCell.font={ bold:true };
    labelCell.alignment={ horizontal:"left", vertical:"middle" };
    valueCell.alignment={ horizontal:"center", vertical:"middle" };

    if(i%2===0){
      labelCell.fill={ type:"pattern", pattern:"solid", fgColor:{argb:ROW_ZEBRA} };
      valueCell.fill={ type:"pattern", pattern:"solid", fgColor:{argb:ROW_ZEBRA} };
    }

    if(spec.kpi==="blue"){
      labelCell.fill={ type:"pattern", pattern:"solid", fgColor:{argb:KPI_BLUE_BG} };
      valueCell.fill={ type:"pattern", pattern:"solid", fgColor:{argb:KPI_BLUE_BG} };
      valueCell.font={ bold:true, color:{argb:KPI_BLUE_TEXT} };
    } else if(spec.kpi==="red"){
      labelCell.fill={ type:"pattern", pattern:"solid", fgColor:{argb:KPI_RED_BG} };
      valueCell.fill={ type:"pattern", pattern:"solid", fgColor:{argb:KPI_RED_BG} };
      valueCell.font={ bold:true, color:{argb:KPI_RED_TEXT} };
    }
    r++;
  });
}

// ---------------- DATA ACCESS ----------------
const LOCATION_ID_FALLBACK = Number(process.env.REPORT_LOCATION_ID) || 22769;

async function getLocationAlias(location_id){
  const { rows }=await pool.query(
    `SELECT COALESCE(alias, location_name) AS alias FROM qq.locations WHERE location_id=$1`,
    [location_id]
  );
  return rows[0]?.alias || null;
}
function normalizeRange(startISO,endISO){
  return IGNORE_DATE_RANGE ? { start:null, end:null } : { start:startISO, end:endISO };
}
async function getBinderErrorsActive(location_id,startISO,endISO){
  const { start,end }=normalizeRange(startISO,endISO);
  const sql=`SELECT * FROM intranet.get_policy_report_by_location($1::int,$2::date,$3::date) x
             WHERE TRIM(UPPER(COALESCE(x.policy_status,'')))=ANY($4::text[])`;
  return (await pool.query(sql,[location_id,start,end,ACTIVE_LABELS])).rows;
}
async function getMissingCsrProducerActive(location_id,startISO,endISO){
  const { start,end }=normalizeRange(startISO,endISO);
  const sql=`SELECT * FROM intranet.get_policies_missing_csr_or_producer($1::int,$2::date,$3::date) t
             WHERE TRIM(UPPER(COALESCE(t.policy_status,'')))=ANY($4::text[])`;
  return (await pool.query(sql,[location_id,start,end,ACTIVE_LABELS])).rows;
}
async function getCustomersNoPhone(id){
  return (await pool.query(`SELECT * FROM intranet.get_active_customers_without_phone($1::int)`,[id])).rows;
}
async function getCustomersNoEmail(id){
  return (await pool.query(`SELECT * FROM intranet.get_active_customers_without_email($1::int)`,[id])).rows;
}
async function getCustomersInvalidEmail(id){
  return (await pool.query(`SELECT * FROM intranet.get_active_customers_with_invalid_email($1::int)`,[id])).rows;
}
async function getActiveCounts(id,startISO,endISO){
  const { start,end }=normalizeRange(startISO,endISO);
  const qPolicies=`SELECT COUNT(*)::int AS cnt
                   FROM qq.policies p JOIN qq.contacts c ON c.entity_id=p.customer_id
                   WHERE TRIM(UPPER(COALESCE(p.policy_status,'')))=ANY($3::text[])
                     AND c.location_id=$1
                     AND ($2::date IS NULL OR p.effective_date >= $2::date)
                     AND ($4::date IS NULL OR p.effective_date <= $4::date)`;
  const qClients=`SELECT COUNT(DISTINCT p.customer_id)::int AS cnt
                  FROM qq.policies p JOIN qq.contacts c ON c.entity_id=p.customer_id
                  WHERE TRIM(UPPER(COALESCE(p.policy_status,'')))=ANY($3::text[])
                    AND c.location_id=$1
                    AND ($2::date IS NULL OR p.effective_date >= $2::date)
                    AND ($4::date IS NULL OR p.effective_date <= $4::date)`;
  const [rp,rc]=await Promise.all([
    pool.query(qPolicies,[id,start,ACTIVE_LABELS,end]),
    pool.query(qClients,[id,start,ACTIVE_LABELS,end])
  ]);
  return {
    active_policies:Number(rp.rows?.[0]?.cnt||0),
    active_clients:Number(rc.rows?.[0]?.cnt||0)
  };
}
function computeSummaryFromDetails({ binderErrors, missingCSRRows, customersNoPhone, customersNoEmail, customersInvalidEmail }){
  const binder_errors=binderErrors?.length||0;
  let csr_total=0, producer_total=0, missing_any_total=0;
  if(Array.isArray(missingCSRRows)){
    missing_any_total=missingCSRRows.length;
    for(const r of missingCSRRows){
      const mf=String(r.missing_fields||"").toUpperCase();
      if(mf.includes("CSR")) csr_total++;
      if(mf.includes("PRODUCER")) producer_total++;
    }
  }
  const missing_contact_info=
    (customersNoPhone?.length||0)+
    (customersNoEmail?.length||0)+
    (customersInvalidEmail?.length||0);
  const total_errors=binder_errors+missing_any_total+missing_contact_info;
  return { binder_errors, csr_total, producer_total, missing_any_total, missing_contact_info, total_errors };
}

// ---------------- REPORT BUILD ----------------
async function buildWorkbookBuffer({
  summary, activeCounts,
  binderErrors, missingCSR,
  customersNoPhone, customersNoEmail, customersInvalidEmail,
  franchiseName, periodLabel
}){
  const workbook=new ExcelJS.Workbook();
  workbook.creator="GTI Reports";
  workbook.created=new Date();

  const logoId=await addWorkbookLogo(workbook);

  // SUMMARY sheet (with text in E:F)
  const wsSummary=workbook.addWorksheet(cleanSheetName("SUMMARY"));
  const summaryHeaderIdx=createPanel(wsSummary, franchiseName, periodLabel, logoId, { showText:true });
  writeVerticalSummary(wsSummary, { ...summary, ...activeCounts }, summaryHeaderIdx);
  formatTable(wsSummary, summaryHeaderIdx);

  function addDataSheet(name, columnsDef, rows){
    const ws=workbook.addWorksheet(cleanSheetName(name));
    const headerRowIdx=createPanel(ws, franchiseName, periodLabel, logoId, { showText:false });

    // Write header row manually (row = headerRowIdx)
    const headerRow=ws.getRow(headerRowIdx);
    columnsDef.forEach((col,i)=> headerRow.getCell(i+1).value=col.header);
    headerRow.commit();

    // Data rows
    rows.forEach(obj=>{
      ws.addRow(columnsDef.map(c => obj[c.key] ?? null));
    });

    formatTable(ws, headerRowIdx);
  }

  addDataSheet("Binder Errors", [
    { header:"Policy #", key:"policy_number" },
    { header:"Line of Business", key:"line_of_business" },
    { header:"Business Type", key:"business_type" },
    { header:"CSR", key:"csr" },
    { header:"Producer", key:"producer" },
    { header:"Binder Date", key:"binder_date" },
    { header:"Effective Date", key:"effective_date" },
    { header:"Location", key:"location" },
    { header:"Policy Status", key:"policy_status" }
  ], binderErrors);

  addDataSheet("Missing CSR/Producer", [
    { header:"Policy #", key:"policy_number" },
    { header:"Line of Business", key:"line_of_business" },
    { header:"Business Type", key:"business_type" },
    { header:"CSR", key:"csr" },
    { header:"Producer", key:"producer" },
    { header:"Binder Date", key:"binder_date" },
    { header:"Effective Date", key:"effective_date" },
    { header:"Location", key:"location" },
    { header:"Policy Status", key:"policy_status" },
    { header:"Missing Fields", key:"missing_fields" }
  ], missingCSR);

  addDataSheet("Customers No Phone", [
    { header:"Customer ID", key:"customer_id" },
    { header:"Customer", key:"customer_display_name" },
    { header:"Location", key:"location_alias" },
    { header:"Type", key:"type_display" },
    { header:"Email", key:"email" },
    { header:"Phone", key:"phone" }
  ], customersNoPhone);

  addDataSheet("Customers No Email", [
    { header:"Customer ID", key:"customer_id" },
    { header:"Customer", key:"customer_display_name" },
    { header:"Location", key:"location_alias" },
    { header:"Type", key:"type_display" },
    { header:"Email", key:"email" },
    { header:"Phone", key:"phone" }
  ], customersNoEmail);

  addDataSheet("Customers Invalid Email", [
    { header:"Customer ID", key:"customer_id" },
    { header:"Customer", key:"customer_display_name" },
    { header:"Location", key:"location_alias" },
    { header:"Type", key:"type_display" },
    { header:"Email", key:"email" },
    { header:"Phone", key:"phone" }
  ], customersInvalidEmail);

  const buffer=await workbook.xlsx.writeBuffer();

  if(process.env.REPORT_DEBUG_SAVE==="1"){
    try{
      const debugPath=path.resolve(process.cwd(),"debug_franchise_errors.xlsx");
      await workbook.xlsx.writeFile(debugPath);
      console.log("[REPORT] Debug workbook saved:", debugPath);
    }catch(e){
      console.warn("[REPORT] Debug save failed:", e?.message||e);
    }
  }

  return buffer;
}

// ---------------- EMAIL ----------------
async function sendEmailWithAttachment({ subject, text, buffer, filename }){
  if(!EMAIL_FROM || !EMAIL_TO){
    throw new Error("Email sender or recipient not properly configured (G_EMAIL / REPORT_EMAIL_TO).");
  }
  const transporter=nodemailer.createTransport(EMAIL_TRANSPORT_OPTIONS);
  await transporter.sendMail({
    from: EMAIL_FROM,
    to: EMAIL_TO,
    subject,
    text,
    attachments: [{
      filename,
      content: buffer
    }]
  });
  console.log("[REPORT] Email sent to:", EMAIL_TO);
}

// ---------------- MAIN JOB ----------------
export async function runFranchiseErrorsEmailJob(){
  try{
    const { startISO: defStart, endISO: defEnd }=getRange();
    const startISO=IGNORE_DATE_RANGE?null:defStart;
    const endISO=IGNORE_DATE_RANGE?null:defEnd;

    const cliLoc=parseInt(parseArg("--location"),10);
    const location_id=Number.isFinite(cliLoc)?cliLoc:LOCATION_ID_FALLBACK;

    const locationAlias=(await getLocationAlias(location_id))||`location-${location_id}`;
    const aliasForFilename=sanitizeFilename(locationAlias,`location-${location_id}`);
    const periodLabel=prettyPeriod(defStart,defEnd);

    console.log(`[REPORT] Generating ACTIVE EMAIL report for "${locationAlias}" (id=${location_id}) IGNORE_DATE_RANGE=${IGNORE_DATE_RANGE}`);

    const [
      binderErrors,
      missingCSR,
      customersNoPhone,
      customersNoEmail,
      customersInvalidEmail
    ]=await Promise.all([
      getBinderErrorsActive(location_id,startISO,endISO),
      getMissingCsrProducerActive(location_id,startISO,endISO),
      getCustomersNoPhone(location_id),
      getCustomersNoEmail(location_id),
      getCustomersInvalidEmail(location_id)
    ]);

    const activeCounts=await getActiveCounts(location_id,startISO,endISO);

    const summary=computeSummaryFromDetails({
      binderErrors,
      missingCSRRows:missingCSR,
      customersNoPhone,
      customersNoEmail,
      customersInvalidEmail
    });

    const buffer=await buildWorkbookBuffer({
      summary,
      activeCounts,
      binderErrors,
      missingCSR,
      customersNoPhone,
      customersNoEmail,
      customersInvalidEmail,
      franchiseName: locationAlias,
      periodLabel
    });

    const subject=`${EMAIL_SUBJECT_PREFIX} Franchise Errors Report (Active) - ${locationAlias} - ${periodLabel}`.trim();
    const text=`Attached is the ACTIVE franchise errors report for "${locationAlias}" covering: ${periodLabel}.`;

    await sendEmailWithAttachment({
      subject,
      text,
      buffer,
      filename:`franchise-errors-active-${aliasForFilename}.xlsx`
    });

    console.log("[REPORT] Report generation & email COMPLETED.");
  }catch(e){
    console.error("[REPORT] Job failed:", e?.message||e);
    if(process.env.THROW_ON_FAIL==="1") throw e;
  }
}

// CLI trigger
const isDirectRun=(()=>{
  try{
    const thisFile=fileURLToPath(import.meta.url);
    const invoked=path.resolve(process.argv[1]||"");
    return thisFile===invoked;
  }catch{return false;}
})();
if(isDirectRun){
  runFranchiseErrorsEmailJob().catch(()=>process.exit(1));
}