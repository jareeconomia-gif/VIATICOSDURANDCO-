'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const { DatabaseSync, backup } = require('node:sqlite');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const PUBLIC_DIR = ROOT;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const BACKUP_DIR = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(ROOT, 'backups');
const DB_PATH = path.join(DATA_DIR, 'portal-viaticos.sqlite');
const SESSION_DAYS = Math.max(1, Number(process.env.SESSION_DAYS || 7));
const MAX_BODY = 20 * 1024 * 1024;

const SAP_LAYOUT_TECH_HEADERS=["3","COMPANYCODE","SUPPLIERINVOICETRANSACTIONTYPE","INVOICINGPARTY","SUPPLIERINVOICEIDBYINVCGPARTY","DOCUMENTDATE","POSTINGDATE","ACCOUNTINGDOCUMENTTYPE","ACCOUNTINGDOCUMENTHEADERTEXT","DOCUMENTCURRENCY","INVOICEGROSSAMOUNT","BUSINESSPLACE","PAYMENTBLOCKINGREASON","DUECALCULATIONBASEDATE","MANUALCASHDISCOUNT","PAYMENTMETHOD","PAYMENTMETHODSUPPLEMENT","PAYMENTREFERENCE","INVOICEREFERENCE","INVOICEREFERENCEFISCALYEAR","PAYMENTTERMS","CASHDISCOUNT1DAYS","CASHDISCOUNT1PERCENT","CASHDISCOUNT2DAYS","CASHDISCOUNT2PERCENT","NETPAYMENTDAYS","FIXEDCASHDISCOUNT","UNPLANNEDDELIVERYCOST","UNPLANNEDDELIVERYCOSTTAXCODE","UNPLNDDELIVCOSTTAXJURISDICTION","REFERENCEDOCUMENTCATEGORY","ASSIGNMENTREFERENCE","SUPPLIERPOSTINGLINEITEMTEXT","BUSINESSSECTIONCODE","PAYTSLIPWTHREFSUBSCRIBER","PAYTSLIPWTHREFCHECKDIGIT","PAYTSLIPWTHREFREFERENCE","BUSINESSAREA","INVOICERECEIPTDATE","DELIVERYOFGOODSREPORTINGCNTRY","ISEUTRIANGULARDEAL","TAXDETERMINATIONDATE","HOUSEBANK","HOUSEBANKACCOUNT","UNPLNDDELIVERYCOSTTAXCOUNTRY","JRNLENTRYCNTRYSPECIFICREF1","JRNLENTRYCNTRYSPECIFICDATE1","BPBANKACCOUNTINTERNALID","TAXREPORTINGDATE","TAXFULFILLMENTDATE","JRNLENTRYCNTRYSPECIFICBP1","JRNLENTRYCNTRYSPECIFICBP2","JRNLENTRYCNTRYSPECIFICDATE2","JRNLENTRYCNTRYSPECIFICDATE3","JRNLENTRYCNTRYSPECIFICDATE4","JRNLENTRYCNTRYSPECIFICDATE5","JRNLENTRYCNTRYSPECIFICREF2","JRNLENTRYCNTRYSPECIFICREF3","JRNLENTRYCNTRYSPECIFICREF4","JRNLENTRYCNTRYSPECIFICREF5","IBAN","ONETIMEACCTCNTRYSPECIFICREF1","PAYMENTREASON","NUMBEROFPAGES","SUPPLYINGCOUNTRY1","STATECENTRALBANKPAYMENTREASON1","INVOICINGPARTYACCOUNT","SUPPLIERINVOICEORIGIN","BUSINESSNETWORKORIGIN","SUPPLIERINVOICEUPLOADFILEUUID","SUPPLIERINVOICEUPLOADORIGIN","COMPANYCODE","GLACCOUNT","SUPPLIERINVOICEITEMTEXT","DEBITCREDITCODE","SUPPLIERINVOICEITEMAMOUNT","TAXCODE","TAXJURISDICTION","ASSIGNMENTREFERENCE","COSTCENTER","PROFITCENTER","INTERNALORDER","WBSELEMENT","BUSINESSAREA","BUSINESSPROCESS","CONTROLLINGAREA","COSTCTRACTIVITYTYPE","COSTOBJECT","FUNCTIONALAREA","ISNOTCASHDISCOUNTLIABLE","PERSONNELNUMBER","SALESORDER","SALESORDERITEM","PROJECTNETWORK","NETWORKACTIVITY","WORKITEM","COMMITMENTITEM","FUNDSMANAGEMENTCENTER","TAXBASEAMOUNTINTRANSCRCY","FUNDS","GRANT","QUANTITYUNIT","QUANTITY","PARTNERBUSINESSAREA","SERVICEDOCUMENTTYPE","SERVICEDOCUMENT","SERVICEDOCUMENTITEM","TAXCOUNTRY","FINANCIALTRANSACTIONTYPE","BUDGETPERIOD","EARMARKEDFUNDSDOCUMENT","EARMARKEDFUNDSDOCUMENTITEM","EMRKDFNDSITMISCOMPLETED","JOINTVENTURERECOVERYCODE","MATERIAL"];
const SAP_LAYOUT_DISPLAY_HEADERS=["*ID de factura","*Sociedad (4)","*Operación (1)_x000D_\n1=Factura; 2=Abono","*Emisor de factura (10)","Referencia (16)","*Fecha de documento","*Fecha de contabilización","*Clase de documento (2)","Texto de cabecera de documento (25)","*Moneda (5)","*Importe bruto de factura en moneda del documento","Lugar comercial (4)","Clave para bloqueo de pago (1)","Fecha base para cálculo del vencimiento","Importe del descuento en moneda del documento","Vía de pago (1)","Suplemento para la vía de pago (2)","Referencia de pago (30)","Ref.factura: número de documento de ref.para ref.factura (10)","Ejercicio de la factura correspondiente (para abonos) (4)","Clave de condiciones de pago (4)","Días del descuento por pronto pago 1 (3)","Porcentaje de descuento 1 (5)","Días del descuento por pronto pago 2 (3)","Porcentaje de descuento 2 (5)","Plazo para condición de pago neto (3)","Condición de pago fija (1)","Costes indirectos de adquisición no planificados","Indicador de IVA (2)","Domicilio fiscal (15)","Tipo documento referencia (1)","Número de asignación (18)","Texto posición (50)","Sección de retención de impuestos (4)","Nº de usuario ESR (11)","Dígito de control ESR (2)","Número de referencia ESR/QR (27)","División (4)","Fecha de recepción de factura","País/Región declarante p.entrega mercancías dentro de la CE (3)","Indicador: Operación triangular dentro de UE (1)","Fecha para determinar tipos impositivos","Clave breve para banco propio (5)","Clave breve para un banco/cuenta (5)","País/Región de declaración fiscal (3)","Referencia 1 específica de país/región en el documento (80)","Fecha 1 específica de país/región en el documento","Tipo de banco interlocutor (4)","Fecha de declaración fiscal","Fecha de cumplimiento fiscal","Interl.comercial 1 específico de país/región en documento (10)","Interl.comercial 2 específico de país/región en documento (10)","Fecha 2 específica de país/región en el documento","Fecha 3 específica de país/región en el documento","Fecha 4 específica de país/región en el documento","Fecha 5 específica de país/región en el documento","Referencia específica de país/región 2 en el documento (25)","Referencia 3 específica de país/región en el documento (25)","Referencia 4 específica de país/región en el documento (50)","Referencia 5 específica de país/región en el documento (50)","IBAN (International Bank Account Number) (34)","Referencia específica de país/regió en datos de cuenta CpD (140)","Motivo de pago (4)","Cantidad de páginas de factura (3)","País/región proveedor/a (3)","Indicador del banco central regional (3)","Cuenta asociada (10)","Origen documento verificación facturas logística (1)","Origen del documento de red empresarial (2)","UUID de carga de factura (16)","Origen de factura cargada (2)","Sociedad (4)","Cuenta (10)","Texto posición (50)","Indicador debe/haber (1)_x000D_\nS=Debe; H=Haber","Importe en la moneda del documento","Indicador de IVA (2)","Domicilio fiscal (15)","Asignación (18)","Centro de coste (10)","Centro de beneficio (10)","Número de orden (12)","Elemento PEP (24)","División (4)","Proceso empresarial (12)","Sociedad CO (4)","Clase de actividad (6)","Objeto de coste (12)","Área funcional (16)","No es apto para descuento por pronto pago (1)","Número de personal (8)","Número del pedido de cliente (10)","Posición de pedido de cliente (6)","Número de grafo para imputación (12)","Número de operación (4)","ID de work item (10)","Posición presupuestaria (14)","Centro gestor (16)","Importe base impuesto moneda documento","Fondo (10)","Subvención (20)","Unidad de medida base (3)","Cantidad (13)","División del interlocutor (4)","Clase de documento de servicio (4)","ID de documento de servicio (10)","ID de posición de documento de servicio (6)","País/Región de declaración fiscal (3)","Cl.movimiento (3)","Período de presupuesto (10)","Número de documento presupuestario (10)","Posición de documento: Documento presupuestario (3)","Indicador de conclusión para la posición de documento (1)","Indicador de recuperación (2)","Número de material (40)"];
const SAP_LAYOUT_EXACT_WIDTHS=[32,15,30,25,31,21,27,25,37,18,51,21,32,41,47,17,36,25,63,59,34,42,31,42,31,39,28,50,30,32,31,27,29,39,26,27,34,14,31,65,50,41,35,38,39,44,51,32,29,30,64,64,51,51,51,51,61,61,61,61,47,66,20,36,29,42,23,54,45,31,31,15,13,25,43,36,22,23,21,22,26,22,19,14,26,17,24,22,21,47,24,35,35,38,25,22,30,23,40,12,17,27,15,31,36,34,45,39,26,29,41,53,59,31,25];
const SAP_LAYOUT_EXACT_HIDDEN=new Set([15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,43,44,45,47,48,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115]);
const SAP_LAYOUT_SECTIONS=Array(115).fill("3");
SAP_LAYOUT_SECTIONS[1]="Datos cab.";
SAP_LAYOUT_SECTIONS[71]="Pos.cta.mayor";

function excelDateSerial(value){
  if(!value)return null;
  const parts=String(value).slice(0,10).split('-').map(Number);
  if(parts.length!==3||parts.some(Number.isNaN))return null;
  return Math.floor((Date.UTC(parts[0],parts[1]-1,parts[2])-Date.UTC(1899,11,30))/86400000);
}
function sapLayoutColumnMap(){
  const map=new Map();
  SAP_LAYOUT_TECH_HEADERS.forEach((name,index)=>{
    if(!map.has(name))map.set(name,[]);
    map.get(name).push(index);
  });
  return map;
}
const SAP_LAYOUT_COLS=sapLayoutColumnMap();
function setSapValue(row,name,value,occurrence=0){
  const indexes=SAP_LAYOUT_COLS.get(name)||[];
  if(indexes[occurrence]!==undefined)row[indexes[occurrence]]=value??null;
}

let exactSapTemplateBufferCache=null;
function exactSapTemplateBuffer(){
  if(exactSapTemplateBufferCache)return exactSapTemplateBufferCache;
  const parts=[1,2,3,4,5].map(n=>fs.readFileSync(path.join(ROOT,`sap-template-p${n}.b64`),'utf8').trim()).join('');
  if(parts.length!==21476)throw new Error('La plantilla SAP instalada no coincide con el XLSX oficial.');
  const buffer=Buffer.from(parts,'base64');
  const sha=crypto.createHash('sha256').update(buffer).digest('hex');
  if(buffer.length!==16106||sha!=='119820b331592317084fbdd6a32e3ea0b7203fa15fe1b563d39825589509cff6'){
    throw new Error('La plantilla SAP instalada no es exactamente Factura de proveedor_ES(1).XLSX.');
  }
  exactSapTemplateBufferCache=buffer;
  return exactSapTemplateBufferCache;
}
// Valida al arrancar que la plantilla incluida sea byte por byte el XLSX oficial cargado por la usuaria.
exactSapTemplateBuffer();
function xmlEscape(value){
  return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
function setExactTemplateCell(rowXml,col,rowNumber,value,kind='string'){
  const ref=`${col}${rowNumber}`;
  const rx=new RegExp(`<c r="${ref}"([^>]*)\\/>|<c r="${ref}"([^>]*)>[\\s\\S]*?<\\/c>`);
  const match=rowXml.match(rx);
  if(!match)throw Object.assign(new Error(`La plantilla SAP no contiene la celda esperada ${ref}.`),{statusCode:500});
  let attrs=(match[1]??match[2]??'').replace(/\s+t="[^"]*"/g,'');
  let cell='';
  if(value===null||value===undefined||value===''){
    cell=`<c r="${ref}"${attrs}/>`;
  }else if(kind==='number'||kind==='date'){
    const numeric=kind==='date'?excelDateSerial(value):Number(value);
    if(!Number.isFinite(numeric))throw Object.assign(new Error(`Valor numérico inválido para ${ref}.`),{statusCode:400});
    cell=`<c r="${ref}"${attrs}><v>${numeric}</v></c>`;
  }else{
    cell=`<c r="${ref}"${attrs} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
  }
  return rowXml.replace(rx,cell);
}
function invoiceGroupsForExactLayout(request,requesterProfile={}){
  const proof=request?.proof||{};
  if(Array.isArray(proof.sapInvoices)&&proof.sapInvoices.length)return proof.sapInvoices;
  const legacy=Array.isArray(proof.expenseLines)?proof.expenseLines:[];
  if(legacy.length){
    return legacy.map((line,index)=>({
      invoiceId:String(index+1),
      companyCode:proof.companyCode||'4000',
      operation:'1',
      invoicingParty:requesterProfile.sapVendorId||proof.sapVendorId||'',
      reference:line.invoiceNumber||line.reference||request.id,
      documentDate:line.documentDate||proof.documentDate||proof.invoiceDate||'',
      postingDate:line.postingDate||proof.postingDate||line.documentDate||'',
      documentType:'KR',
      headerText:proof.headerText||('VIATICOS '+request.id),
      currency:line.currency||proof.currency||'MXN',
      grossAmount:Number(line.grossAmount??line.amount??0)||0,
      dueCalculationBaseDate:proof.baselineDate||line.postingDate||line.documentDate||'',
      taxDeterminationDate:line.postingDate||line.documentDate||'',
      countryReference1:'N/A',
      taxReportingDate:line.postingDate||line.documentDate||'',
      taxFulfillmentDate:line.postingDate||line.documentDate||'',
      positions:[{
        companyCode:proof.companyCode||'4000',
        glAccount:line.account||'',
        itemText:line.text||line.uuid||line.concept||'',
        debitCredit:'S',
        amount:Number(line.netAmount??line.taxBase??line.amount??0)||0,
        taxCode:line.taxCode||'',
        assignment:line.assignment||line.reference||line.invoiceNumber||'',
        costCenter:line.costCenter||request.costProject||'',
        wbsElement:line.project||request.project||'',
        taxBase:Number(line.taxBase??line.netAmount??line.amount??0)||0
      }]
    }));
  }
  return[];
}
function validateExactInvoice(invoice,index,sapVendorId){
  const required=[
    ['Referencia',invoice.reference],
    ['Fecha de documento',invoice.documentDate],
    ['Fecha de contabilización',invoice.postingDate],
    ['Texto de cabecera',invoice.headerText],
    ['Moneda',invoice.currency],
    ['Importe bruto',invoice.grossAmount],
    ['Fecha base para vencimiento',invoice.dueCalculationBaseDate],
    ['Fecha para determinar tipos impositivos',invoice.taxDeterminationDate],
    ['Fecha de declaración fiscal',invoice.taxReportingDate],
    ['Fecha de cumplimiento fiscal',invoice.taxFulfillmentDate]
  ];
  for(const [label,value] of required){
    if(value===null||value===undefined||String(value).trim()===''||((label==='Importe bruto')&&!(Number(value)>0))){
      throw Object.assign(new Error(`Factura ${index+1}: falta ${label}.`),{statusCode:400});
    }
  }
  if(!sapVendorId)throw Object.assign(new Error('Falta configurar el Emisor SAP (10) del solicitante en Administración → Usuarios.'),{statusCode:409});
  if(String(sapVendorId).length>10)throw Object.assign(new Error('El Emisor SAP del solicitante excede los 10 caracteres permitidos.'),{statusCode:409});
  if(!Array.isArray(invoice.positions)||!invoice.positions.length)throw Object.assign(new Error(`Factura ${index+1}: agrega al menos una posición del libro mayor.`),{statusCode:400});
  invoice.positions.forEach((p,pi)=>{
    [['Cuenta',p.glAccount],['Texto posición',p.itemText],['Importe',p.amount],['Indicador IVA',p.taxCode],['Asignación',p.assignment],['Centro de coste',p.costCenter]].forEach(([label,value])=>{
      if(value===null||value===undefined||String(value).trim()===''||((label==='Importe')&&!(Number(value)>0))){
        throw Object.assign(new Error(`Factura ${index+1}, posición ${pi+1}: falta ${label}.`),{statusCode:400});
      }
    });
  });
}
function buildSapLayoutBuffer(request, requesterProfile={}){
  const proof=request?.proof||{};
  const sapVendorId=String(requesterProfile.sapVendorId||proof.sapVendorId||'').trim();
  const invoices=invoiceGroupsForExactLayout(request,requesterProfile);
  if(!invoices.length)throw Object.assign(new Error('La comprobación no contiene facturas para generar el layout SAP.'),{statusCode:400});
  invoices.forEach((inv,i)=>validateExactInvoice(inv,i,sapVendorId));

  const zip=new AdmZip(exactSapTemplateBuffer());
  const sheetEntry=zip.getEntry('xl/worksheets/sheet1.xml');
  if(!sheetEntry)throw Object.assign(new Error('La plantilla SAP exacta no contiene la hoja Data esperada.'),{statusCode:500});
  let xml=sheetEntry.getData().toString('utf8');
  const row7Match=xml.match(/<row r="7"[^>]*>[\s\S]*?<\/row>/);
  if(!row7Match)throw Object.assign(new Error('La plantilla SAP exacta no contiene la fila modelo 7.'),{statusCode:500});
  const baseRow=row7Match[0];
  const generated=[];
  let rowNumber=7;

  invoices.forEach((invoice,invoiceIndex)=>{
    const companyCode=String(invoice.companyCode||'4000').slice(0,4);
    const invoiceId=String(invoice.invoiceId||invoiceIndex+1);
    const operation=String(invoice.operation||'1').slice(0,1);
    const documentType=String(invoice.documentType||'KR').slice(0,2);
    const headerText=String(invoice.headerText||('VIATICOS '+request.id)).slice(0,25);
    const currency=String(invoice.currency||'MXN').slice(0,5);
    const countryReference1=String(invoice.countryReference1||'N/A').slice(0,80);

    invoice.positions.forEach((position)=>{
      let row=baseRow
        .replace(/<row r="7"/,'<row r="'+rowNumber+'"')
        .replace(/r="([A-Z]+)7"/g,(_m,col)=>'r="'+col+rowNumber+'"');
      const values=[
        ['A',invoiceId,'string'],
        ['B',companyCode,'string'],
        ['C',operation,'string'],
        ['D',sapVendorId,'string'],
        ['E',String(invoice.reference||'').slice(0,16),'string'],
        ['F',invoice.documentDate,'date'],
        ['G',invoice.postingDate,'date'],
        ['H',documentType,'string'],
        ['I',headerText,'string'],
        ['J',currency,'string'],
        ['K',Number(invoice.grossAmount),'number'],
        ['N',invoice.dueCalculationBaseDate,'date'],
        ['AP',invoice.taxDeterminationDate,'date'],
        ['AT',countryReference1,'string'],
        ['AW',invoice.taxReportingDate,'date'],
        ['AX',invoice.taxFulfillmentDate,'date'],
        ['BT',String(position.companyCode||companyCode).slice(0,4),'string'],
        ['BU',String(position.glAccount||'').slice(0,10),'string'],
        ['BV',String(position.itemText||'').slice(0,50),'string'],
        ['BW',String(position.debitCredit||'S').slice(0,1),'string'],
        ['BX',Number(position.amount),'number'],
        ['BY',String(position.taxCode||'').slice(0,2),'string'],
        ['CA',String(position.assignment||'').slice(0,18),'string'],
        ['CB',String(position.costCenter||'').slice(0,10),'string'],
        ['CE',String(position.wbsElement||'').slice(0,24),'string'],
        ['CU',Number(position.taxBase??position.amount),'number']
      ];
      for(const [col,value,kind] of values)row=setExactTemplateCell(row,col,rowNumber,value,kind);
      // Los demás campos permanecen exactamente como están en la plantilla original: vacíos.
      generated.push(row);
      rowNumber++;
    });
  });

  xml=xml.replace(/<row r="7"[^>]*>[\s\S]*?<\/row>(?:<row r="8"[^>]*>[\s\S]*?<\/row>)?/,generated.join(''));
  const lastRow=Math.max(7,rowNumber-1);
  xml=xml.replace(/<dimension ref="A1:DK\d+"\/>/,`<dimension ref="A1:DK${lastRow}"/>`);
  xml=xml.replace(/activeCell="A\d+" sqref="A\d+:AX\d+"/,`activeCell="A${lastRow}" sqref="A${lastRow}:AX${lastRow}"`);
  zip.updateFile('xl/worksheets/sheet1.xml',Buffer.from(xml,'utf8'));
  return zip.toBuffer();
}

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('capturador','master')),
    active INTEGER NOT NULL DEFAULT 1,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    requester_email TEXT NOT NULL,
    status TEXT,
    jefe_approver_id TEXT,
    direccion_approver_id TEXT,
    updated_at TEXT NOT NULL,
    updated_by TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_viaticos_requester ON requests(requester_email);
  CREATE INDEX IF NOT EXISTS idx_viaticos_jefe ON requests(jefe_approver_id);
  CREATE INDEX IF NOT EXISTS idx_viaticos_direccion ON requests(direccion_approver_id);
  CREATE INDEX IF NOT EXISTS idx_viaticos_status ON requests(status);

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details TEXT,
    created_at TEXT NOT NULL
  );
`);

const DEFAULT_CONFIG = {
 companies:['Grupo Industrial Durandco','Blue Marine','BME Oil & Gas','BME Shipping II','BME Subtec','DBS','BMBS','Lichter Seguridad','Durandco Industrial'],
 positions:[
  {name:'Director Corporativo',group:'I'},{name:'Director Ejecutivo / Director de Área',group:'II'},
  {name:'Director Staff',group:'III'},{name:'Subdirector Ejecutivo / Subdirector de Área',group:'III'},
  {name:'Gerente Ejecutivo / Gerente de Área',group:'IV'},{name:'Jefe / Coordinador',group:'V'},
  {name:'Analista / Asistente / demás puestos',group:'V'}
 ],
 destinations:['CDMX','Ciudad del Carmen','Paraíso','Villahermosa'],
 requestTypes:['Viáticos anticipados','Tarjeta corporativa'],
 paymentMethods:['Transferencia electrónica','Tarjeta corporativa'],
 rates:{
  I:{food:4500,transport:1000,parking:700,hotel:3500},
  II:{food:3000,transport:800,parking:700,hotel:3000},
  III:{food:2500,transport:700,parking:500,hotel:1800},
  IV:{food:1500,transport:600,parking:500,hotel:1600},
  V:{food:950,transport:500,parking:500,hotel:1200}
 },
 approvalRules:{
  skipDirectionBelowLimit:true,
  directionThreshold:50000
 },
 questions:[
  {id:'onLeave',label:'¿Está de vacaciones, permiso o incapacidad?',default:'No',blockYes:true,message:'No se pueden otorgar viáticos durante vacaciones, permisos o incapacidad.',core:true},
  {id:'pendingProof',label:'¿Tiene comprobaciones pendientes?',default:'No',blockYes:true,message:'Debe cerrar la comprobación anterior antes de recibir nuevos recursos.',core:true},
  {id:'utilityVehicle',label:'¿Cuenta con vehículo utilitario?',default:'No',core:true},
  {id:'personalVehicle',label:'¿Usará automóvil particular?',default:'No',blockYes:true,message:'El uso de automóvil particular no está permitido.',core:true},
  {id:'requiresHotel',label:'¿Requiere hospedaje?',default:'Sí',core:true},
  {id:'budgeted',label:'¿El viaje está presupuestado?',default:'Sí',core:true},
  {id:'international',label:'¿Es un viaje al extranjero?',default:'No',core:true}
 ],
 flow:{jefeUserId:'JEFE',direccionUserId:'DIRECCION',requireComment:true},
 approverRoleProfiles:[
  {id:'AR_JEFE_DEFAULT',name:'Autorizador Jefe inmediato',type:'jefe',linkedUserId:'JEFE',description:'Perfil inicial de Jefe inmediato'},
  {id:'AR_DIRECCION_DEFAULT',name:'Autorizador Dirección',type:'direccion',linkedUserId:'DIRECCION',description:'Perfil inicial de Dirección'}
 ],
 approvalProfiles:[
  {id:'PROFILE_GENERAL',name:'Flujo general',description:'Ruta estándar de aprobación',jefeRoleProfileId:'AR_JEFE_DEFAULT',direccionRoleProfileId:'AR_DIRECCION_DEFAULT',jefeUserId:'JEFE',direccionUserId:'DIRECCION',requireComment:true}
 ]
};

const DEFAULT_USERS = [
  {
    id:'MASTER', email:'gls@durandco.com', password:'123456', name:'Génesis León Sarabia', role:'master',
    company:'Grupo Industrial Durandco', position:'Director Corporativo', baseCity:'CDMX', canApproveJefe:true, canApproveDireccion:true,
    jefeApproverId:'', direccionApproverId:'MASTER'
  },
  {
    id:'JEFE', email:'jefe.inmediato@empresa.com', password:'Jefe2026!', name:'Autorizador Jefe Inmediato', role:'capturador',
    company:'Grupo Industrial Durandco', position:'Gerente Ejecutivo / Gerente de Área', baseCity:'CDMX', canApproveJefe:true, canApproveDireccion:false,
    jefeApproverId:'MASTER', direccionApproverId:'MASTER'
  },
  {
    id:'DIRECCION', email:'direccion@empresa.com', password:'Direccion2026!', name:'Autorizador Dirección', role:'capturador',
    company:'Grupo Industrial Durandco', position:'Director Corporativo', baseCity:'CDMX', canApproveJefe:false, canApproveDireccion:true,
    jefeApproverId:'JEFE', direccionApproverId:'MASTER'
  },
  {
    id:'LUIS', email:'lams@durandco.com', password:'Luis2026!', name:'Luis Mondragón', role:'capturador',
    company:'Grupo Industrial Durandco', position:'Director Corporativo', baseCity:'CDMX', canApproveJefe:false, canApproveDireccion:true,
    jefeApproverId:'JEFE', direccionApproverId:'MASTER'
  }
];

function nowIso() { return new Date().toISOString(); }
function normalize(value) { return String(value || '').trim().toLocaleLowerCase('es-MX'); }
function safeJsonParse(value, fallback = null) { try { return JSON.parse(value); } catch { return fallback; } }
function cleanObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
function verifyPassword(password, encoded) {
  const [kind, salt, expected] = String(encoded || '').split('$');
  if (kind !== 'scrypt' || !salt || !expected) return false;
  const actual = crypto.scryptSync(String(password), salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return expectedBuffer.length === actual.length && crypto.timingSafeEqual(expectedBuffer, actual);
}
function hashToken(token) { return crypto.createHash('sha256').update(token).digest('hex'); }

function sanitizeUserPayload(payload, row = null) {
  const source = cleanObject(payload);
  const resolvedId = String(source.id || row?.id || '');
  const isMaster = resolvedId === 'MASTER' || row?.id === 'MASTER';
  const user = {
    ...source,
    id: resolvedId,
    email: normalize(source.email || row?.email || ''),
    name: String(source.name || row?.name || '').trim(),
    role: isMaster ? 'master' : 'capturador',
    company: String(source.company || ''),
    position: String(source.position || ''),
    baseCity: String(source.baseCity || ''),
    canApproveJefe: isMaster ? true : Boolean(source.canApproveJefe),
    canApproveDireccion: isMaster ? true : Boolean(source.canApproveDireccion),
    jefeApproverId: isMaster ? '' : String(source.jefeApproverId || ''),
    direccionApproverId: isMaster ? 'MASTER' : String(source.direccionApproverId || 'MASTER')
  };
  delete user.password;
  delete user.password_hash;
  return user;
}
function publicUser(row) {
  if (!row) return null;
  return sanitizeUserPayload(safeJsonParse(row.payload, {}), row);
}
function audit(userId, action, entityType, entityId = '', details = null) {
  db.prepare('INSERT INTO audit_log(user_id,action,entity_type,entity_id,details,created_at) VALUES(?,?,?,?,?,?)')
    .run(userId || null, action, entityType, entityId ? String(entityId) : null, details ? JSON.stringify(details) : null, nowIso());
}
function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? safeJsonParse(row.value, null) : null;
}
function setSetting(key, value, userId) {
  db.prepare(`INSERT INTO settings(key,value,updated_at,updated_by) VALUES(?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
    .run(key, JSON.stringify(value), nowIso(), userId || null);
}

function seed() {
  const insert = db.prepare(`INSERT OR IGNORE INTO users(id,email,password_hash,name,role,active,payload,created_at,updated_at)
    VALUES(?,?,?,?,?,1,?,?,?)`);
  const stamp = nowIso();
  for (const seedUser of DEFAULT_USERS) {
    const payload = sanitizeUserPayload(seedUser);
    insert.run(payload.id, payload.email, hashPassword(seedUser.password), payload.name, payload.role, JSON.stringify(payload), stamp, stamp);
  }
  if (!getSetting('config')) setSetting('config', DEFAULT_CONFIG, 'system');
}
seed();

function updateMasterIdentity() {
  const master = db.prepare('SELECT * FROM users WHERE id=?').get('MASTER');
  if (!master) return;
  const targetEmail = 'gls@durandco.com';
  const duplicate = db.prepare('SELECT id FROM users WHERE lower(email)=? AND id<>?').get(targetEmail, 'MASTER');
  if (duplicate) {
    console.warn('No se actualizó el correo del usuario maestro porque ya existe otro usuario con gls@durandco.com.');
    return;
  }
  const payload = sanitizeUserPayload(safeJsonParse(master.payload, {}), master);
  payload.name = 'Génesis León Sarabia';
  payload.email = targetEmail;
  db.prepare('UPDATE users SET email=?,name=?,password_hash=?,payload=?,updated_at=? WHERE id=?')
    .run(targetEmail, payload.name, hashPassword('123456'), JSON.stringify(payload), nowIso(), 'MASTER');

  const config = getSetting('config');
  if (config && typeof config === 'object') {
    let changed = false;
    if (Array.isArray(config.approverRoleProfiles)) {
      config.approverRoleProfiles = config.approverRoleProfiles.map(profile => {
        if (profile?.linkedUserId === 'MASTER') {
          changed = true;
          return { ...profile, name: 'Génesis León Sarabia' };
        }
        return profile;
      });
    }
    if (Array.isArray(config.approvalProfiles)) {
      config.approvalProfiles = config.approvalProfiles.map(profile => {
        if (typeof profile?.description === 'string' && profile.description.includes('Giovanni aprueba')) {
          changed = true;
          return { ...profile, description: profile.description.replace('Giovanni aprueba', 'Génesis aprueba') };
        }
        return profile;
      });
    }
    if (changed) setSetting('config', config, 'system');
  }
}
updateMasterIdentity();

function updateLuisIdentity() {
  const luis = db.prepare('SELECT * FROM users WHERE id=?').get('LUIS');
  if (!luis) return;
  const targetEmail = 'lams@durandco.com';
  const duplicate = db.prepare('SELECT id FROM users WHERE lower(email)=? AND id<>?').get(targetEmail, 'LUIS');
  if (duplicate) {
    db.prepare('UPDATE users SET active=0,updated_at=? WHERE id=?').run(nowIso(), duplicate.id);
    audit('system', 'deactivate_duplicate_email', 'user', duplicate.id, { email: targetEmail, reassignedTo: 'LUIS' });
  }
  const payload = sanitizeUserPayload(safeJsonParse(luis.payload, {}), luis);
  payload.name = 'Luis Mondragón';
  payload.email = targetEmail;
  payload.canApproveDireccion = true;
  payload.direccionApproverId = 'MASTER';
  db.prepare('UPDATE users SET email=?,name=?,role=?,active=1,payload=?,updated_at=? WHERE id=?')
    .run(targetEmail, payload.name, 'capturador', JSON.stringify(payload), nowIso(), 'LUIS');
}
updateLuisIdentity();


function parseCookies(req) {
  const result = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    result[decodeURIComponent(part.slice(0, index).trim())] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return result;
}
function isSecureRequest(req) {
  return process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https';
}
function setSessionCookie(res, token, req) {
  const secure = isSecureRequest(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `viaticos_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}${secure}`);
}
function clearSessionCookie(res, req) {
  const secure = isSecureRequest(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `viaticos_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}
function getAuth(req) {
  const token = parseCookies(req).viaticos_session;
  if (!token) return null;
  const row = db.prepare(`SELECT s.token_hash,s.expires_at,u.* FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND u.active=1`).get(hashToken(token));
  if (!row || Date.parse(row.expires_at) <= Date.now()) {
    if (row) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(row.token_hash);
    return null;
  }
  db.prepare('UPDATE sessions SET last_seen_at=? WHERE token_hash=?').run(nowIso(), row.token_hash);
  return publicUser(row);
}
function requireAuth(req, res) {
  const user = getAuth(req);
  if (!user) {
    json(res, 401, { error: 'Sesión no válida o vencida.' });
    return null;
  }
  return user;
}
function assertSameOrigin(req, res) {
  if (!['POST','PUT','PATCH','DELETE'].includes(req.method)) return true;
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] || (isSecureRequest(req) ? 'https' : 'http');
  if (origin !== `${protocol}://${host}`) {
    json(res, 403, { error: 'Origen no permitido.' });
    return false;
  }
  return true;
}
function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self' data: blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
}
function json(res, status, payload) {
  securityHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}
async function readJson(req) {
  return await new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('El contenido supera el límite permitido.'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('JSON no válido.'), { statusCode: 400 })); }
    });
    req.on('error', reject);
  });
}

function listUsers() {
  return db.prepare('SELECT * FROM users WHERE active=1 ORDER BY CASE WHEN id=\'MASTER\' THEN 0 ELSE 1 END, name').all().map(publicUser);
}
function requestRowToPayload(row) { return safeJsonParse(row.payload, {}); }
function listRequestsFor(user) {
  const rows = user.role === 'master'
    ? db.prepare('SELECT * FROM requests ORDER BY updated_at DESC').all()
    : db.prepare(`SELECT * FROM requests WHERE lower(requester_email)=? OR jefe_approver_id=? OR direccion_approver_id=? ORDER BY updated_at DESC`)
      .all(normalize(user.email), user.id, user.id);
  return rows.map(requestRowToPayload);
}
function normalizeRequest(input) {
  const request = clone(cleanObject(input));
  request.id = String(request.id || '').trim();
  request.requesterEmail = normalize(request.requesterEmail);
  request.status = String(request.status || 'Pendiente Aprobación Jefe');
  request.jefeApproverId = String(request.jefeApproverId || '');
  request.direccionApproverId = String(request.direccionApproverId || (normalize(request.requestType)==='tarjeta corporativa' ? 'LUIS' : 'MASTER'));
  request.requiresDirection = true;
  request.skipDirectionBelowLimit = false;
  if (!Array.isArray(request.history)) request.history = [];
  return request;
}
function upsertRequest(request, userId) {
  db.prepare(`INSERT INTO requests(id,payload,requester_email,status,jefe_approver_id,direccion_approver_id,updated_at,updated_by)
    VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,requester_email=excluded.requester_email,status=excluded.status,
      jefe_approver_id=excluded.jefe_approver_id,direccion_approver_id=excluded.direccion_approver_id,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
    .run(request.id, JSON.stringify(request), request.requesterEmail, request.status, request.jefeApproverId, request.direccionApproverId, nowIso(), userId);
}
function mergeApproverUpdate(oldRequest, incoming) {
  const next = clone(oldRequest);
  const fields = ['status','jefeComment','jefeSignedBy','jefeSignedAt','direccionComment','resourceReadyAt','cardAuthorizedAt','giovanniNotifiedAt','history'];
  for (const field of fields) if (Object.hasOwn(incoming, field)) next[field] = clone(incoming[field]);
  next.jefeApproverId = oldRequest.jefeApproverId;
  next.direccionApproverId = oldRequest.direccionApproverId;
  next.requesterEmail = oldRequest.requesterEmail;
  next.requester = oldRequest.requester;
  return normalizeRequest(next);
}
function mergeOwnerUpdate(oldRequest, incoming) {
  const next = clone(incoming);
  const protectedFields = ['status','jefeApproverId','direccionApproverId','jefeComment','jefeSignedBy','jefeSignedAt','direccionComment','resourceReadyAt','cardAuthorizedAt','giovanniNotifiedAt'];
  for (const field of protectedFields) next[field] = clone(oldRequest[field]);
  next.requesterEmail = oldRequest.requesterEmail;
  next.requester = oldRequest.requester;
  return normalizeRequest(next);
}
function canUpdateRequest(user, oldRequest, incoming) {
  if (user.role === 'master') return { allowed: true, mode: 'master' };
  if (!oldRequest) return normalize(incoming.requesterEmail) === normalize(user.email)
    ? { allowed: true, mode: 'new-owner' }
    : { allowed: false };
  if (normalize(oldRequest.requesterEmail) === normalize(user.email)) return { allowed: true, mode: 'owner' };
  if (oldRequest.jefeApproverId === user.id && oldRequest.status === 'Pendiente Aprobación Jefe' && user.canApproveJefe) {
    return { allowed: true, mode: 'approver' };
  }
  if (oldRequest.direccionApproverId === user.id &&
      ['Pendiente Genesis Leon','Pendiente Luis Mondragón'].includes(String(oldRequest.status || '')) &&
      user.canApproveDireccion) {
    return { allowed: true, mode: 'approver' };
  }
  return { allowed: false };
}


function upsertOneUser(user, raw) {
  if (user.role !== 'master') throw Object.assign(new Error('Sólo el usuario maestro puede administrar usuarios.'), { statusCode: 403 });
  const source = cleanObject(raw);
  const id = String(source.id || '').trim();
  if (!id || !source.name || !source.email) throw Object.assign(new Error('El usuario requiere ID, nombre y correo.'), { statusCode: 400 });
  const existing = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  const payload = sanitizeUserPayload(source, existing);
  if (id === 'MASTER') {
    payload.id = 'MASTER';
    payload.role = 'master';
    payload.canApproveJefe = true;
    payload.canApproveDireccion = true;
    payload.direccionApproverId = 'MASTER';
  }
  if (id === 'LUIS') {
    payload.role = 'capturador';
    payload.canApproveDireccion = true;
    payload.direccionApproverId = 'MASTER';
  }
  const duplicate = db.prepare('SELECT id,active FROM users WHERE lower(email)=? AND id<>?').get(payload.email, id);
  if (duplicate) throw Object.assign(new Error(`El correo ${payload.email} ya pertenece a otro usuario.`), { statusCode: 409 });
  const suppliedPassword = typeof source.password === 'string' ? source.password : '';
  let passwordHash = existing?.password_hash;
  if (!existing && suppliedPassword.length < 6) {
    throw Object.assign(new Error('La contraseña inicial debe tener al menos 6 caracteres.'), { statusCode: 400 });
  }
  if (suppliedPassword) {
    if (suppliedPassword.length < 6) throw Object.assign(new Error('La contraseña debe tener al menos 6 caracteres.'), { statusCode: 400 });
    passwordHash = hashPassword(suppliedPassword);
  }
  const stamp = nowIso();
  db.prepare(`INSERT INTO users(id,email,password_hash,name,role,active,payload,created_at,updated_at)
    VALUES(?,?,?,?,?,1,?,?,?)
    ON CONFLICT(id) DO UPDATE SET email=excluded.email,password_hash=excluded.password_hash,name=excluded.name,role=excluded.role,
      active=1,payload=excluded.payload,updated_at=excluded.updated_at`)
    .run(id, payload.email, passwordHash, payload.name, payload.role, JSON.stringify(payload), existing?.created_at || stamp, stamp);
  audit(user.id, existing ? 'update' : 'create', 'user', id, { email: payload.email, passwordChanged: Boolean(suppliedPassword) });
  return publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(id));
}

async function syncUsers(user, incomingUsers) {
  if (user.role !== 'master') throw Object.assign(new Error('Sólo el usuario maestro puede administrar usuarios.'), { statusCode: 403 });
  if (!Array.isArray(incomingUsers)) throw Object.assign(new Error('La lista de usuarios no es válida.'), { statusCode: 400 });
  const existingRows = db.prepare('SELECT * FROM users').all();
  const existingById = new Map(existingRows.map(row => [row.id, row]));
  const seen = new Set();
  const stamp = nowIso();
  db.exec('BEGIN');
  try {
    for (const raw of incomingUsers) {
      const source = cleanObject(raw);
      const id = String(source.id || '').trim();
      if (!id || !source.name || !source.email) throw Object.assign(new Error('Cada usuario requiere ID, nombre y correo.'), { statusCode: 400 });
      const existing = existingById.get(id);
      const payload = sanitizeUserPayload(source, existing);
      if (id === 'MASTER') {
        payload.id = 'MASTER'; payload.role = 'master'; payload.canApproveJefe = true; payload.canApproveDireccion = true; payload.direccionApproverId = 'MASTER';
      }
      const duplicate = db.prepare('SELECT id FROM users WHERE lower(email)=? AND id<>?').get(payload.email, id);
      if (duplicate) throw Object.assign(new Error(`El correo ${payload.email} ya pertenece a otro usuario.`), { statusCode: 409 });
      let passwordHash = existing?.password_hash;
      const suppliedPassword = typeof source.password === 'string' ? source.password : '';
      if (!existing && suppliedPassword.length < 6) throw Object.assign(new Error(`Define una contraseña inicial de al menos 6 caracteres para ${payload.name}.`), { statusCode: 400 });
      if (suppliedPassword) {
        if (suppliedPassword.length < 6) throw Object.assign(new Error('La contraseña debe tener al menos 6 caracteres.'), { statusCode: 400 });
        passwordHash = hashPassword(suppliedPassword);
      }
      db.prepare(`INSERT INTO users(id,email,password_hash,name,role,active,payload,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?,?)
        ON CONFLICT(id) DO UPDATE SET email=excluded.email,password_hash=excluded.password_hash,name=excluded.name,role=excluded.role,
          active=1,payload=excluded.payload,updated_at=excluded.updated_at`)
        .run(id, payload.email, passwordHash, payload.name, payload.role, JSON.stringify(payload), existing?.created_at || stamp, stamp);
      seen.add(id);
    }
    for (const row of existingRows) {
      if (!['MASTER','LUIS'].includes(row.id) && !seen.has(row.id)) db.prepare('UPDATE users SET active=0,updated_at=? WHERE id=?').run(stamp, row.id);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  audit(user.id, 'sync', 'users', '', { count: incomingUsers.length });
}

async function syncRequests(user, incomingRequests) {
  if (!Array.isArray(incomingRequests)) throw Object.assign(new Error('La lista de solicitudes no es válida.'), { statusCode: 400 });
  const normalized = incomingRequests.map(normalizeRequest).filter(request => request.id);
  const incomingIds = new Set(normalized.map(request => request.id));
  const allRows = db.prepare('SELECT * FROM requests').all();
  const byId = new Map(allRows.map(row => [row.id, requestRowToPayload(row)]));

  db.exec('BEGIN');
  try {
    for (const incoming of normalized) {
      const oldRequest = byId.get(incoming.id) || null;
      const permission = canUpdateRequest(user, oldRequest, incoming);
      if (!permission.allowed) continue;
      let next = incoming;
      if (permission.mode === 'approver') next = mergeApproverUpdate(oldRequest, incoming);
      if (permission.mode === 'owner') next = mergeOwnerUpdate(oldRequest, incoming);
      if (permission.mode === 'new-owner') {
        const userRow = db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(user.id);
        const profile = publicUser(userRow);
        if (!profile?.jefeApproverId) throw Object.assign(new Error('Tu usuario todavía no tiene asignado un Jefe inmediato para firma.'), { statusCode: 400 });
        next.requesterEmail = normalize(user.email);
        next.requester = user.name;
        next.jefeApproverId = profile.jefeApproverId;
        next.status = 'Pendiente Aprobación Jefe';
        next.direccionApproverId = String(incoming.direccionApproverId || (normalize(incoming.requestType)==='tarjeta corporativa' ? 'LUIS' : 'MASTER'));
      }
      upsertRequest(normalizeRequest(next), user.id);
    }
    if (user.role === 'master') {
      for (const row of allRows) {
        if (!incomingIds.has(row.id)) db.prepare('DELETE FROM requests WHERE id=?').run(row.id);
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  audit(user.id, 'sync', 'requests', '', { count: normalized.length });
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'application/javascript; charset=utf-8',
    '.json':'application/json; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml',
    '.ico':'image/x-icon', '.webp':'image/webp', '.csv':'text/csv; charset=utf-8'
  })[ext] || 'application/octet-stream';
}
function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let filePath = path.resolve(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== path.join(PUBLIC_DIR, 'index.html')) return json(res, 403, { error: 'Ruta no permitida.' });
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) filePath = path.join(PUBLIC_DIR, 'index.html');
  securityHeaders(res);
  res.statusCode = 200;
  res.setHeader('Content-Type', contentType(filePath));
  res.setHeader('Cache-Control', path.basename(filePath) === 'index.html' ? 'no-cache' : 'public, max-age=3600');
  fs.createReadStream(filePath).pipe(res);
}

async function handleApi(req, res, pathname) {
  if (!assertSameOrigin(req, res)) return;
  if (req.method === 'GET' && pathname === '/api/health') return json(res, 200, { ok: true, service: 'portal-viaticos-durandco', time: nowIso() });

  if (req.method === 'POST' && pathname === '/api/login') {
    const body = await readJson(req);
    const email = normalize(body.email);
    const row = db.prepare('SELECT * FROM users WHERE lower(email)=? AND active=1').get(email);
    if (!row || !verifyPassword(body.password, row.password_hash)) {
      audit(row?.id || null, 'login_failed', 'session', '', { email });
      return json(res, 401, { error: 'Correo o contraseña incorrectos.' });
    }
    const token = crypto.randomBytes(32).toString('base64url');
    const stamp = nowIso();
    const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(stamp);
    db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)')
      .run(hashToken(token), row.id, expires, stamp, stamp);
    setSessionCookie(res, token, req);
    audit(row.id, 'login', 'session');
    return json(res, 200, { user: publicUser(row) });
  }

  if (req.method === 'POST' && pathname === '/api/logout') {
    const token = parseCookies(req).viaticos_session;
    const user = getAuth(req);
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
    clearSessionCookie(res, req);
    if (user) audit(user.id, 'logout', 'session');
    return json(res, 200, { ok: true });
  }

  const user = requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET' && pathname === '/api/me') return json(res, 200, { user });

  if (req.method === 'GET' && pathname === '/api/bootstrap') {
    return json(res, 200, {
      user,
      users: listUsers(),
      config: getSetting('config') || DEFAULT_CONFIG,
      requests: listRequestsFor(user),
      serverTime: nowIso()
    });
  }

  if (req.method === 'PUT' && pathname === '/api/state/config') {
    if (user.role !== 'master') return json(res, 403, { error: 'Sólo el usuario maestro puede modificar la configuración.' });
    const body = await readJson(req);
    setSetting('config', cleanObject(body.value), user.id);
    audit(user.id, 'update', 'config');
    return json(res, 200, { ok: true });
  }

  if (req.method === 'PUT' && pathname === '/api/profile') {
    const body = await readJson(req);
    const row = db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(user.id);
    if (!row) return json(res, 404, { error: 'Usuario no encontrado.' });
    const current = publicUser(row);
    const source = cleanObject(body.profile);
    const next = sanitizeUserPayload({
      ...current,
      company: String(source.company || current.company || ''),
      position: String(source.position || current.position || ''),
      baseCity: String(source.baseCity || current.baseCity || '')
    }, row);
    db.prepare('UPDATE users SET payload=?,updated_at=? WHERE id=?').run(JSON.stringify(next), nowIso(), user.id);
    audit(user.id, 'update', 'profile', user.id, { company: next.company, position: next.position, baseCity: next.baseCity });
    return json(res, 200, { ok: true, user: next });
  }

  if (req.method === 'PUT' && pathname === '/api/user/admin') {
    const body = await readJson(req);
    const saved = upsertOneUser(user, body.user);
    return json(res, 200, { ok: true, user: saved });
  }

  if (req.method === 'PUT' && pathname === '/api/state/users') {
    const body = await readJson(req);
    await syncUsers(user, body.users);
    return json(res, 200, { ok: true, users: listUsers() });
  }

  if (req.method === 'PUT' && pathname === '/api/requests/sync') {
    const body = await readJson(req);
    await syncRequests(user, body.requests);
    return json(res, 200, { ok: true, requests: listRequestsFor(user) });
  }

  if (req.method === 'POST' && pathname === '/api/change-password') {
    const body = await readJson(req);
    const row = db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(user.id);
    if (!row || !verifyPassword(body.currentPassword, row.password_hash)) return json(res, 400, { error: 'La contraseña actual no es correcta.' });
    const nextPassword = String(body.newPassword || '');
    if (nextPassword.length < 8 || !/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(nextPassword) || !/\d/.test(nextPassword)) {
      return json(res, 400, { error: 'La nueva contraseña debe tener al menos 8 caracteres, letras y números.' });
    }
    db.prepare('UPDATE users SET password_hash=?,updated_at=? WHERE id=?').run(hashPassword(nextPassword), nowIso(), user.id);
    audit(user.id, 'change_password', 'user', user.id);
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/api/migrate') {
    if (user.role !== 'master') return json(res, 403, { error: 'Sólo el usuario maestro puede migrar datos.' });
    const body = await readJson(req);
    if (body.config) setSetting('config', cleanObject(body.config), user.id);
    if (Array.isArray(body.users)) await syncUsers(user, body.users);
    if (Array.isArray(body.requests)) await syncRequests(user, body.requests);
    audit(user.id, 'migrate', 'application', '', { requests: body.requests?.length || 0, users: body.users?.length || 0 });
    return json(res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname.startsWith('/api/sap-layout/')) {
    if (user.role !== 'master') return json(res, 403, { error: 'Sólo Génesis puede descargar el layout SAP.' });
    const requestId = decodeURIComponent(pathname.slice('/api/sap-layout/'.length));
    const row = db.prepare('SELECT * FROM requests WHERE id=?').get(requestId);
    if (!row) return json(res, 404, { error: 'Solicitud no encontrada.' });
    const request = requestRowToPayload(row);
    if (!request.proof?.submittedAt && !['Enviada','En revisión','Reintegro validado','Finalizada','Pendiente validación SAP','Viáticos validados'].includes(String(request.proof?.status || ''))) {
      return json(res, 409, { error: 'La comprobación todavía no ha sido enviada.' });
    }
    const requesterRow=db.prepare('SELECT * FROM users WHERE lower(email)=? AND active=1').get(normalize(request.requesterEmail));
    const requesterProfile=publicUser(requesterRow)||{};
    let buffer;
    try { buffer = buildSapLayoutBuffer(request,requesterProfile); }
    catch (error) { return json(res, error.statusCode || 400, { error: error.message || 'No se pudo generar el layout.' }); }
    const stamp=nowIso();
    request.proof=request.proof||{};
    request.proof.layoutGeneratedAt=request.proof.layoutGeneratedAt||stamp;
    request.proof.layoutDownloadedAt=stamp;
    request.proof.layoutDownloadedBy=user.name;
    request.history=Array.isArray(request.history)?request.history:[];
    request.history.push({stage:'Layout SAP descargado',by:user.name,date:stamp,comment:'Factura de Proveedor SAP'});
    upsertRequest(normalizeRequest(request),user.id);
    audit(user.id,'download','sap_layout',requestId,{rows:request.proof?.expenseLines?.length||request.proof?.actualExpenses?.length||0});
    securityHeaders(res);
    res.statusCode=200;
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename="Factura_de_proveedor_${requestId}.xlsx"`);
    res.setHeader('Content-Length',buffer.length);
    return res.end(buffer);
  }

  if (req.method === 'GET' && pathname === '/api/admin/backup') {
    if (user.role !== 'master') return json(res, 403, { error: 'Sólo el usuario maestro puede descargar respaldos.' });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `portal-viaticos-${stamp}.sqlite`;
    const destination = path.join(BACKUP_DIR, filename);
    await backup(db, destination);
    audit(user.id, 'backup', 'database', filename);
    securityHeaders(res);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/vnd.sqlite3');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', fs.statSync(destination).size);
    return fs.createReadStream(destination).pipe(res);
  }

  if (req.method === 'GET' && pathname === '/api/admin/audit') {
    if (user.role !== 'master') return json(res, 403, { error: 'Acceso restringido.' });
    const rows = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 500').all().map(row => ({ ...row, details: safeJsonParse(row.details, null) }));
    return json(res, 200, { audit: rows });
  }

  return json(res, 404, { error: 'Ruta no encontrada.' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url.pathname);
    else serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) json(res, error.statusCode || 500, { error: error.message || 'Error interno del servidor.' });
    else res.destroy();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Portal de Viáticos activo en http://${HOST}:${PORT}`);
  console.log(`Base de datos: ${DB_PATH}`);
});
