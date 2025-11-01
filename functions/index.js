/*
automated-hiring-funnel/functions/index.js
(REWRITTEN V7 - FULLY TAILORED MSA)
*/

/* eslint-disable indent */
/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable no-trailing-spaces */
/* eslint-disable object-curly-spacing */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

// --- BEGIN SHARED LOGIC ---
// (This is your existing, correct calculation logic)

function getDiscountAmount(subtotal, discountUsd, discountPct) {
  if (discountUsd > 0) {
    return discountUsd;
  } else if (discountPct > 0) {
    if (subtotal === 0) return 0;
    return subtotal * (discountPct / 100.0);
  }
  return 0;
}

function calculateProject(lockedVars, config) {
  const baseRates = config.base_rates;
  const modelConfig = config.models.project;
  const exemptions = lockedVars.exemptions || [];
  const hours = lockedVars.hours || 0;
  const buffer = lockedVars.buffer / 100.0 || 0;
  const hourlyRate = baseRates.hourly_rate || 0;
  const subtotal = hours * hourlyRate * (1 + buffer);
  let discountVal = 0;
  if (!exemptions.includes("project")) {
    discountVal = getDiscountAmount(
      subtotal,
      lockedVars.discountUsd,
      lockedVars.discountPct,
    );
  }
  const finalTotal = subtotal - discountVal;
  return {
    name: modelConfig.display_name,
    totalCost: finalTotal,
  };
}

function calculateSubscription(lockedVars, clientChoices, config) {
  const baseRates = config.base_rates;
  const modelConfig = config.models.subscription;
  const tierKey = clientChoices.tier;
  const paymentKey = clientChoices.paymentPlan;
  const amortizationTerm = clientChoices.amortizationTerm;
  if (!modelConfig || !baseRates) {
    return { name: "Loading...", setupFee: 0, amortizedMonthly: 0, tierMonthly: 0, totalActiveMonthly: 0, buyoutPrice: 0 };
  }
  const tierConfig = modelConfig.tiers[tierKey];
  const paymentConfig = modelConfig.payment_options[paymentKey];
  if (!tierConfig || !paymentConfig || !amortizationTerm) {
    return { name: "Select options", setupFee: 0, amortizedMonthly: 0, tierMonthly: 0, totalActiveMonthly: 0, buyoutPrice: 0 };
  }
  const exemptions = lockedVars.exemptions || [];
  const hours = lockedVars.hours || 0;
  const buffer = lockedVars.buffer / 100.0 || 0;
  const hourlyRate = baseRates.hourly_rate || 0;
  const totalBuildCost = hours * hourlyRate * (1 + buffer);
  const isSetupExempt = exemptions.includes("setup");
  const isAmortExempt = exemptions.includes("amortized");
  let buildDiscountVal = 0;
  if (!isSetupExempt && !isAmortExempt) {
    buildDiscountVal = getDiscountAmount(
      totalBuildCost,
      lockedVars.discountUsd,
      lockedVars.discountPct,
    );
  }
  const finalBuildCostForBuyout = totalBuildCost - buildDiscountVal;
  const setupFeePercent = paymentConfig.setup_fee_percent_of_build;
  const setupFeeSubtotal = totalBuildCost * (setupFeePercent / 100.0);
  let setupDiscountVal = 0;
  if (!isSetupExempt) {
    setupDiscountVal = getDiscountAmount(
      setupFeeSubtotal,
      lockedVars.discountUsd,
      lockedVars.discountPct,
    );
  }
  const finalSetupFee = setupFeeSubtotal - setupDiscountVal;
  const remainingBuildCost = totalBuildCost - setupFeeSubtotal;
  const amortizedMonthlySubtotal =
    amortizationTerm > 0 ? remainingBuildCost / amortizationTerm : 0;
  const tierMonthlySubtotal = tierConfig.monthly_rate;
  let amortizedDiscountVal = 0;
  if (!isAmortExempt) {
    amortizedDiscountVal = getDiscountAmount(
      amortizedMonthlySubtotal,
      lockedVars.discountUsd,
      lockedVars.discountPct,
    );
  }
  let tierDiscountVal = 0;
  if (!exemptions.includes("tier")) {
    tierDiscountVal = getDiscountAmount(
      tierMonthlySubtotal,
      lockedVars.discountUsd,
      lockedVars.discountPct,
    );
  }
  const finalAmortizedMonthly = amortizedMonthlySubtotal - amortizedDiscountVal;
  const finalTierMonthly = tierMonthlySubtotal - tierDiscountVal;
  return {
    name: `${modelConfig.display_name} - ${tierConfig.name} Tier`,
    setupFee: finalSetupFee,
    amortizedMonthly: finalAmortizedMonthly,
    tierMonthly: finalTierMonthly,
    totalActiveMonthly: finalAmortizedMonthly + finalTierMonthly,
    amortizationTerm: amortizationTerm,
    buyoutPrice: finalBuildCostForBuyout,
    tierName: tierConfig.name,
    minTerm: config.models.subscription.default_min_term_months,
  };
}
// --- END SHARED LOGIC ---


initializeApp();
const db = getFirestore();
const storage = getStorage();

const formatCurrency = (num) => {
  if (isNaN(num)) {
    num = 0;
  }
  return num.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
};

// ---
// NEW V7 PDF-LIB DRAWING HELPERS (POLISHED DESIGN)
// ---

// --- CONFIGURATION ---
const PAGE_WIDTH = 612; // 8.5 inches
const PAGE_HEIGHT = 792; // 11 inches
const MARGIN_TOP = 54; // 0.75 inches
const MARGIN_BOTTOM = 54; // 0.75 inches
const MARGIN_LEFT = 54; // 0.75 inches
const MARGIN_RIGHT = 54; // 0.75 inches
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT; // 504 points

const FONT_SIZES = {
  title: 18,
  h2: 14,
  h3: 11,
  body: 10.5,
  footer: 8,
};

const LINE_GAP = {
  title: 22,
  h2: 18,
  h3: 15,
  body: 15,
  list: 15,
  footer: 10,
};

const COLORS = {
  black: rgb(0, 0, 0),
  darkGray: rgb(0.2, 0.2, 0.2), // For H3s
  gray: rgb(0.3, 0.3, 0.3),
  lightGray: rgb(0.9, 0.9, 0.9), // Lighter line for H2
  navy: rgb(0, 0.2, 0.4), // Dark, professional navy
};

/**
 * Global state for the PDF drawing cursor.
 * This is reset for each new document.
 */
let pdfState = {
  doc: null,
  page: null,
  fonts: {},
  y: PAGE_HEIGHT - MARGIN_TOP,
};

/**
 * Resets the PDF state and adds the first page.
 */
const createPage = () => {
  pdfState.page = pdfState.doc.addPage();
  pdfState.y = PAGE_HEIGHT - MARGIN_TOP;
  drawFooter();
};

/**
 * Adds a new page and resets the cursor.
 */
const addPage = () => {
  pdfState.page = pdfState.doc.addPage();
  pdfState.y = PAGE_HEIGHT - MARGIN_TOP;
  drawFooter();
};

/**
 * Checks if a new page is needed before drawing content.
 * This version includes 'keep-together' logic.
 * @param {number} contentHeight - The height of the content about to be drawn.
 * @param {object} options - Options like keepWithNext (points).
 */
const checkPageBreak = (contentHeight, options = {}) => {
  const keepWithNext = options.keepWithNext || 0; // e.g., keep 1 line of body text
  const safeBreakPoint = MARGIN_BOTTOM + keepWithNext;

  if (pdfState.y - contentHeight < safeBreakPoint) {
    addPage();
    return true; // Page was broken
  }
  return false; // Page was not broken
};

/**
 * Draws the repeating footer on the current page.
 */
const drawFooter = () => {
  const pageNum = pdfState.doc.getPageCount();
  pdfState.page.drawText(`Page ${pageNum}`, {
    x: MARGIN_LEFT,
    y: MARGIN_BOTTOM / 2,
    size: FONT_SIZES.footer,
    font: pdfState.fonts.helvetica,
    color: COLORS.gray,
  });
};

/**
 * Helper to get text width for centering.
 */
const getTextWidth = (text, font, size) => {
  return font.widthOfTextAtSize(text, size);
};

/**
 * THE KEY FIX: A 'multi_cell' equivalent for pdf-lib.
 * This function calculates line wraps and draws text.
 * @returns {number} The total height of the drawn text block.
 */
const drawWrappedText = ({
  text,
  font,
  size,
  x = MARGIN_LEFT,
  maxWidth = CONTENT_WIDTH,
  lineGap = LINE_GAP.body,
  color = COLORS.black,
  returnLines = false, // Add this flag
}) => {
  // Clean up text
  text = text.replace(/<strong>(.*?)<\/strong>/g, "$1");
  text = text.replace(/<em>(.*?)<\/em>/g, "$1");
  text = text.replace(/\*\*(.*?)\*\*/g, "$1");
  text = text.replace(/_(.*?)_/g, "$1");

  const words = text.split(" ");
  let lines = [];
  let currentLine = "";

  words.forEach((word) => {
    // Handle manual line breaks
    if (word.includes("\n")) {
      const parts = word.split("\n");
      for (let i = 0; i < parts.length - 1; i++) {
        const partLine = currentLine === "" ? parts[i] : `${currentLine} ${parts[i]}`;
        lines.push(partLine);
        currentLine = "";
      }
      word = parts[parts.length - 1];
    }

    const testLine = currentLine === "" ? word : `${currentLine} ${word}`;
    const testWidth = font.widthOfTextAtSize(testLine, size);

    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine !== "") {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  });
  lines.push(currentLine);

  if (returnLines) {
    return lines; // Return the array of lines
  }

  const totalHeight = lines.length * lineGap;
  checkPageBreak(totalHeight);

  lines.forEach((line) => {
    if (line.trim() === "") {
       pdfState.y -= lineGap;
       return;
    }
    // Check for page break *per line* to prevent orphans
    checkPageBreak(lineGap); 
    pdfState.page.drawText(line, {
      x,
      y: pdfState.y,
      size,
      font,
      color,
    });
    pdfState.y -= lineGap;
  });

  return totalHeight;
};

// --- PDF DRAWING COMMANDS (RE-STYLED) ---

const addTitle = (text) => {
  const font = pdfState.fonts.helveticaBold;
  const size = FONT_SIZES.title;
  const textWidth = getTextWidth(text, font, size);
  const x = (PAGE_WIDTH / 2) - (textWidth / 2); // Center

  checkPageBreak(LINE_GAP.title * 2);
  pdfState.page.drawText(text, {
    x,
    y: pdfState.y,
    size,
    font,
    color: COLORS.black,
  });
  pdfState.y -= (LINE_GAP.title * 1.5); // Extra space after title
};

const addH2 = (text) => {
  // Smart page break: Keep H2 with at least one line of body text
  checkPageBreak(LINE_GAP.h2 + LINE_GAP.body, { keepWithNext: LINE_GAP.body });
  pdfState.y -= (LINE_GAP.h2 * 0.75); // Space *above* H2
  pdfState.page.drawText(text, {
    x: MARGIN_LEFT,
    y: pdfState.y,
    size: FONT_SIZES.h2,
    font: pdfState.fonts.helveticaBold,
    color: COLORS.navy, // Navy Blue header
  });
  pdfState.y -= LINE_GAP.h2;
  // Removed the underline
  pdfState.y -= (LINE_GAP.h2 * 0.25); // Space *after* H2
};

const addH3 = (text) => {
  // Smart page break: Keep H3 with at least one line of body text
  checkPageBreak(LINE_GAP.h3 + LINE_GAP.body, { keepWithNext: LINE_GAP.body });
  pdfState.y -= (LINE_GAP.h3 * 0.5); // Space *above* H3
  pdfState.page.drawText(text, {
    x: MARGIN_LEFT,
    y: pdfState.y,
    size: FONT_SIZES.h3,
    font: pdfState.fonts.helveticaBold,
    color: COLORS.darkGray, // Bold Black/Gray
  });
  pdfState.y -= LINE_GAP.h3;
};

const addParagraph = (text, options = {}) => {
  const defaults = {
    font: pdfState.fonts.helvetica,
    size: FONT_SIZES.body,
    lineGap: LINE_GAP.body,
    x: MARGIN_LEFT,
    maxWidth: CONTENT_WIDTH,
  };
  drawWrappedText({
    text: text || "",
    ...defaults,
    ...options,
  });
  pdfState.y -= (LINE_GAP.body * 0.5); // Consistent gap after paragraph
};

const addList = (items) => {
  checkPageBreak(items.length * LINE_GAP.list);
  items.forEach((item) => {
    drawWrappedText({
      text: `•  ${item}`,
      font: pdfState.fonts.helvetica,
      size: FONT_SIZES.body,
      x: MARGIN_LEFT + 15, // Indent
      maxWidth: CONTENT_WIDTH - 15,
      lineGap: LINE_GAP.list,
    });
  });
  pdfState.y -= (LINE_GAP.body * 0.5); // Consistent gap
};

const drawCheckbox = (x, y, isChecked, size = 10) => {
  const boxColor = COLORS.darkGray;
  const checkColor = COLORS.black;
  const boxSize = size;
  const boxY = y + 2; // Align with text

  // Draw the box
  pdfState.page.drawRectangle({
    x: x,
    y: boxY,
    width: boxSize,
    height: boxSize,
    borderWidth: 1,
    borderColor: boxColor,
    color: rgb(1, 1, 1), // White fill
  });

  if (isChecked) {
    // Draw the checkmark (✓)
    pdfState.page.drawText("✓", {
        x: x + 1.5,
        y: boxY + 1,
        size: size,
        font: pdfState.fonts.zapfDingbats, // Use the symbol font
        color: checkColor,
    });
  }
};

const addSignatureBlocks = (data, isDPA = false) => {
  const blockHeight = 150;
  // Smart page break: Keep the *entire* signature block together
  if (pdfState.y < MARGIN_BOTTOM + blockHeight) {
    addPage();
  }
  
  const col1X = MARGIN_LEFT;
  const col2X = MARGIN_LEFT + (CONTENT_WIDTH / 2) + 15;
  const sigWidth = (CONTENT_WIDTH / 2) - 15;

  let startY = pdfState.y - 30; // Start 30pts down
  
  // Column Titles
  const title1 = isDPA ? `Company (Controller): ${data.clientLegalName}` : `PROVIDER: ${data.companyName}`;
  const title2 = isDPA ? `Data Processor (Provider): ${data.companyName}` : `CLIENT: ${data.clientLegalName}`;
  
  // Draw Title 1
  pdfState.page.drawText(title1, { x: col1X, y: startY, size: FONT_SIZES.h3, font: pdfState.fonts.helveticaBold, color: COLORS.darkGray });
  const title1Y = startY;
  
  // Draw Title 2
  pdfState.page.drawText(title2, { x: col2X, y: startY, size: FONT_SIZES.h3, font: pdfState.fonts.helveticaBold, color: COLORS.darkGray });
  
  pdfState.y = title1Y - (LINE_GAP.h3 * 1.5); // Move cursor down
  
  startY = pdfState.y;

  // Signature Lines
  pdfState.page.drawLine({ start: { x: col1X, y: startY }, end: { x: col1X + sigWidth, y: startY }, thickness: 1 });
  pdfState.page.drawLine({ start: { x: col2X, y: startY }, end: { x: col2X + sigWidth, y: startY }, thickness: 1 });
  startY -= (LINE_GAP.body * 1.2);

  // Signer 1
  const signer1By = isDPA ? "By: ____________________" : `By: ${data.companyContactName}`;
  const signer1Name = isDPA ? "Name: ____________________" : "Title: Member";
  const signer1Title = isDPA ? "Title: ____________________" : "Date: ____________________";
  const signer1Date = isDPA ? "Date: ____________________" : "";
  
  // Signer 2
  const signer2By = isDPA ? `By: ${data.companyContactName}` : "By: ____________________";
  const signer2Name = isDPA ? "Title: Member" : "Name: ____________________";
  const signer2Title = isDPA ? "Date: ____________________" : "Title: ____________________";
  const signer2Date = isDPA ? "" : "Date: ____________________";

  pdfState.page.drawText(signer1By, { x: col1X, y: startY, size: FONT_SIZES.body, font: pdfState.fonts.helvetica });
  pdfState.page.drawText(signer2By, { x: col2X, y: startY, size: FONT_SIZES.body, font: pdfState.fonts.helvetica });
  startY -= LINE_GAP.body;
  
  pdfState.page.drawText(signer1Name, { x: col1X, y: startY, size: FONT_SIZES.body, font: pdfState.fonts.helvetica });
  pdfState.page.drawText(signer2Name, { x: col2X, y: startY, size: FONT_SIZES.body, font: pdfState.fonts.helvetica });
  startY -= LINE_GAP.body;

  pdfState.page.drawText(signer1Title, { x: col1X, y: startY, size: FONT_SIZES.body, font: pdfState.fonts.helvetica });
  pdfState.page.drawText(signer2Title, { x: col2X, y: startY, size: FONT_SIZES.body, font: pdfState.fonts.helvetica });
  startY -= LINE_GAP.body;

  if (signer1Date || signer2Date) {
    pdfState.page.drawText(signer1Date, { x: col1X, y: startY, size: FONT_SIZES.body, font: pdfState.fonts.helvetica });
    pdfState.page.drawText(signer2Date, { x: col2X, y: startY, size: FONT_SIZES.body, font: pdfState.fonts.helvetica });
  }
};

// --- DOCUMENT CONTENT FUNCTIONS (RE-STYLED) ---

/**
 * Draws the SOW content
 */
const drawSOW = (data) => {
  createPage();
  addTitle("Statement of Work (SOW)");

  addParagraph(`This Statement of Work ("SOW") is entered into effective as of ${data.today} ("SOW Effective Date") by and between ${data.companyName} ("Provider") and ${data.clientLegalName} ("Client"). This SOW is subject to and incorporates by reference the terms and conditions of the Master Service Agreement ("MSA") previously executed between the Parties, dated ${data.today}.`);
  addParagraph("In the event of any conflict between this SOW and the MSA, the terms of this SOW shall prevail for the specific Services described herein.");
  
  addH2(`1. Project Title: ${data.projectTitle}`);

  addH2("2. Engagement Model: (Select ONE)");
  const models = [
    { key: "subscription", text: "Subscription Services (WaaS/SaaS): Client is subscribing to ongoing services as detailed below, subject to the Subscription terms outlined in the MSA (including Provider IP ownership unless Buyout Option is exercised)." },
    { key: "project", text: "Project Build & Buyout Services: Provider will perform the services detailed below on a project basis. Upon full and final payment, ownership of defined Deliverables will transfer to Client as outlined in the MSA." },
    { key: "maintenance", text: "Maintenance Retainer Services: Client is engaging Provider for ongoing maintenance services as detailed below and in the MSA." },
    { key: "hourly", text: "Hourly Services: Client is engaging Provider for services to be billed on a time-and-materials basis at the rate defined below." },
  ];
  
  const checkboxX = MARGIN_LEFT;
  const textX = MARGIN_LEFT + 20;
  const textWidth = CONTENT_WIDTH - 20;

  models.forEach((model) => {
    const isChecked = data.serviceModel === model.key;
    const font = isChecked ? pdfState.fonts.helveticaBold : pdfState.fonts.helvetica;
    
    // Check page break *before* drawing
    checkPageBreak(LINE_GAP.body * 2); // Check for at least 2 lines
    
    // Draw checkbox and text ONCE
    drawCheckbox(checkboxX, pdfState.y - 2, isChecked);
    drawWrappedText({
      text: model.text,
      font,
      size: FONT_SIZES.body,
      x: textX,
      maxWidth: textWidth,
      lineGap: LINE_GAP.body,
    });
    pdfState.y -= (LINE_GAP.body * 0.5); // Add spacing
  });

  addH2("3. Detailed Scope of Work & Deliverables");
  addParagraph("Provider agrees to perform the following services (\"Services\") and provide the following deliverables (\"Deliverables\"):");
  const scopeLines = (data.projectScope || "").split("\n");
  addList(scopeLines.length > 0 ? scopeLines : ["(No scope defined)"]);
  addH3("Specifically Excluded:");
  addParagraph("[Clearly list anything *not* included, e.g., Logo design, content writing, advanced SEO services, third-party software license costs unless specified.]");
  
  addH2("4. Project Timeline & Milestones (Primarily for Project Build Model)");
  addList([
    "Phase 1: Discovery & Design Mockups: Estimated Completion: [Date or X weeks after SOW signing]",
    "Phase 2: Development & Initial Review: Estimated Completion: [Date or X weeks after Design approval]",
    "Phase 3: Testing & Revisions: Estimated Completion: [Date or X weeks after Initial Review]",
    "Phase 4: Final Launch/Deployment: Estimated Completion: [Date or X weeks after Final Approval]",
  ]);
  
  addH2("5. Client Responsibilities");
  addParagraph("Client agrees to provide:");
  addList([
    "Timely feedback and approvals (within [e.g., 2] business days of request).",
    "All necessary text, images, logos, and other content materials required for the project.",
    "Access to existing domain registrar, hosting (if applicable), and any required third-party accounts.",
    "A designated point of contact for project communications.",
  ]);
  
  addH2("6. Fees & Payment Schedule");
  
  if (data.serviceModel === "subscription") {
    addH3(`For Subscription Services (Model A): (${data.fees.tierName} Tier)`);
    addList([
      `One-Time Setup Fee: ${data.fees.setupFee}, due upon SOW execution.`,
      `Amortized Build Cost: ${data.fees.amortizedMonthly} / month`,
      `Monthly Tier Fee: ${data.fees.tierMonthly} / month`,
      `Total Monthly Fee: ${data.fees.totalActiveMonthly} / month`,
      `Initial Term: ${data.fees.minTerm} Months.`,
    ]);
  } else if (data.serviceModel === "project") {
    addH3("For Project Build & Buyout Services (Model B):");
    addList([
      `Total Project Fee: ${data.fees.totalCost}`,
      `Payment Schedule:`,
    ]);
    addList([ // Nested list
      `50% Down Payment: ${formatCurrency(data.fees.rawTotalCost * 0.5)} due upon SOW execution.`,
      `50% Final Payment: ${formatCurrency(data.fees.rawTotalCost * 0.5)} due upon final project acceptance.`,
    ]);
  } else if (data.serviceModel === "maintenance") {
    addH3("For Maintenance Retainer Services (Model C):");
    addList([
      `Monthly Retainer Fee: ${data.fees.monthlyFee} / month`,
      `Included Hours: ${data.fees.includedHours} hours/month`,
    ]);
  } else if (data.serviceModel === "hourly") {
    addH3("For Hourly Services (Model D):");
    addList([
      `Hourly Rate: ${data.fees.hourlyRate} / hour`,
    ]);
  }
  addParagraph("All payments are subject to the terms in Section 3 of the MSA.", { font: pdfState.fonts.helveticaOblique });

  addH2("7. Acceptance Criteria");
  addParagraph(`The project or service launch will be considered complete and accepted upon [Define clear acceptance criteria, e.g., "Client's written (email sufficient) approval of the final deliverables," or "Successful deployment of the website to the live domain specified by Client," or "Commencement of the first billing cycle for Subscription Services post-launch"]. Client agrees to perform final testing within [e.g., 5] business days of Provider indicating readiness for final review.`);

  addH2("8. Term of SOW");
  addParagraph(`This SOW shall commence on the SOW Effective Date and continue until [For Projects: "completion and final acceptance of the Deliverables" or For Subscriptions: "the end of the initial term and any subsequent renewal terms, unless terminated earlier per the MSA"].`);
  
  pdfState.y -= (LINE_GAP.body * 1.5); // Add space before signature block
  addH3("IN WITNESS WHEREOF,");
  addParagraph("the Parties hereto have executed this Statement of Work as of the SOW Effective Date.");
  addSignatureBlocks(data);
};

/**
 * Draws the MSA content
 */
const drawMSA = (data) => {
  createPage(); // Start MSA on a new page
  addTitle("Master Service Agreement");
  
  addParagraph(`This Master Service Agreement ("Agreement") is effective as of the date of the first executed Statement of Work ("SOW") that references it, or, if earlier, the date Provider begins performing Services with Client's express or written authorization (the "Effective Date"). For the avoidance of doubt, written instruction via email or Client's payment of any invoice shall constitute such authorization. Execution of any SOW by Client or Client's payment for any Services shall constitute Client's full and binding acceptance of all terms and conditions herein, even if Client has not separately executed this Agreement.`);
  
  addParagraph(`Provider: ${data.companyName}, a California Limited Liability Company, ${data.companyAddress} ("Provider")`, { font: pdfState.fonts.helveticaBold });
  addParagraph(`Client: ${data.clientLegalName}, a ${data.clientEntityType}, ${data.clientLegalAddress} ("Client")`, { font: pdfState.fonts.helveticaBold });
  addParagraph(`Provider and Client are each referred to as a "Party" and collectively as the "Parties."`);

  addH2("RECITALS");
  addParagraph("WHEREAS, Provider is engaged in the business of designing, developing, and hosting custom digital solutions, including websites and applications;");
  addParagraph("WHEREAS, Client desires to retain Provider to perform certain services as detailed in this Agreement and any applicable Statement of Work;");
  addParagraph("NOW, THEREFORE, in consideration of the mutual covenants contained herein, the Parties agree as follows:");

  addH2("1. DEFINITIONS");
  addH3("1.1 \"Agreement\"");
  addParagraph(`means this Master Service Agreement, its Data Processing Addendum (DPA), and all SOWs, Order Forms, and exhibits attached or incorporated by reference.`);
  addH3("1.2 \"Client Data\"");
  addParagraph(`means any and all content, information, data, and materials provided by Client to Provider, or otherwise collected, processed, or stored by or through the Services on Client's behalf. This includes, but is not limited to, text, graphics, logos, and any end-user or personally identifiable information.`);
  addH3("1.3 \"Confidential Information\"");
  addParagraph(`has the meaning described in Section 4.`);
  addH3("1.4 \"Deliverables\"");
  addParagraph(`means the final, compiled work product created by Provider for Client as specified in a Statement of Work. For a website project, this is typically the set of HTML, CSS, and JavaScript files that constitute the functional website. Deliverables do not include Working Files unless explicitly listed in an SOW.`);
  addH3("1.5 \"Services\"");
  addParagraph(`means all work to be performed by Provider for Client as described in an applicable Statement of Work.`);
  addH3("1.6 \"Statement of Work\" or \"SOW\"");
  addParagraph(`means a written document, including any document titled 'Quote,' 'Proposal,' or 'Order Form,' mutually executed by the Parties, that describes the specific Services and Deliverables to be provided by Provider to Client. For purposes of this Agreement, "mutually executed" means (a) a document bearing the physical or electronic signatures of both Parties, or (b) a document (such as a 'Quote' or 'Proposal') sent by Provider to Client and explicitly approved in writing by Client (including by email, which shall be deemed a binding electronic signature under applicable laws including ESIGN and UETA) by an authorized representative of Client. Client warrants that any individual providing such approval or payment has the full authority to bind Client to the terms of the applicable SOW and this Agreement. Provider may rely on any such approval or payment as conclusive evidence of Client’s acceptance and authority.`);
  addH3("1.7 \"Working Files\"");
  addParagraph(`means all original, editable source files created by Provider during the design and development process, including but not limited to layered design files (e.g., .psd, .fig, .sketch), original illustration files (e.g., .ai), and unrendered video or animation files. Working Files remain the sole and exclusive property and trade secret of Provider.`);

  addH2("2. SERVICES & STATEMENTS OF WORK");
  addH3("2.1 Statements of Work.");
  addParagraph("Provider shall perform the Services as specified in one or more SOWs mutually agreed upon and executed by the Parties. In the event of a conflict between this Agreement and an SOW, the terms of this Agreement shall control, unless the SOW expressly states its intent to override a specific section of this Agreement.");
  addH3("2.2 Change Control.");
  addParagraph(`Any changes to the scope of an SOW must be documented in a written "Change Order." Provider will not perform any work classified as Overage or a Change Request until Client has first approved a written quote (via email or otherwise) for said work, except as provided below for pre-authorized micro-changes. Provider and Client may specify in the applicable SOW a pre-authorized micro-change threshold (the "Micro-Change Threshold") that authorizes Provider to proceed with individual changes without separate approval so long as each change is reasonably estimated by Provider to be at or below the Micro-Change Threshold. Unless otherwise specified in the SOW, the default Micro-Change Threshold shall be one (1) hour of Provider's time. Provider may, at its option, aggregate all Micro-Changes performed within a single billing cycle and invoice them as a single line item. All other Overage work requires Client's affirmative written approval prior to commencement. For any single Overage request that Provider reasonably estimates will require more than one (1) hour of work, Provider will first provide a non-binding estimate and shall pause work and obtain Client approval before proceeding further if the work will exceed the estimate. Any waiver or failure by Provider to enforce scope or billing terms on any occasion shall not constitute a waiver of such rights for future work.`);
  
  if (data.serviceModel === "maintenance") {
    addH3("2.3 Maintenance and Retainer Services.");
    addParagraph(`If Client engages Provider for a "Maintenance Retainer" SOW, the Services shall be defined as follows unless otherwise specified in the SOW:\n(a) Included Services: The retainer fee covers the act of performing routine technical maintenance, including but not limited to: software updates (e.g., CMS, plugins), regular site backups, and security monitoring.\n(b) Service Exclusions and Compatibility. The retainer fee covers routine updates and the remediation of any compatibility bugs or conflicts between the Deliverable's custom code (as built by Provider) and the new version of third-party software that directly arise as a result of performing such updates. Remediation is limited to restoring compatibility and original functionality, and does not include remediation of new or pre-existing bugs within third-party software itself, nor does it include new feature development, redesign, content entry, custom development, strategic consulting, or any other task not explicitly listed under "Included Services." Provider reserves the right to delay or decline an update if, in its reasonable judgment, the update is known to be unstable or high-risk (e.g., a major version change) and should be handled as a separate, billable project. Remediation work performed hereunder shall count against the monthly Service Hours (as defined in Section 2.3(c)); if the work is reasonably estimated by Provider to exceed the remaining hours in a given month, it shall be deemed Overage and subject to the approval process in Section 2.3(d).\n(c) Service Hours: The retainer includes up to two (2) hours of support services per month. Provider shall track all time consumed in minimum increments of fifteen (15) minutes. Time spent in communications, research, and project coordination performed on Client’s behalf shall be considered billable activity and tracked accordingly. Unused time does not roll over to subsequent months.\n(d) Overage: Any work requested by Client that falls under the Service Exclusions, or that exceeds the monthly included Service Hours, will be deemed Overage. Provider shall not perform any Overage work without Client's prior written approval, except for Micro-Changes authorized in the applicable SOW per Section 2.2. Provider will provide a non-binding estimate for Overage requests reasonably expected to exceed one (1) hour and will pause work and obtain Client approval before proceeding further if the work exceeds the estimate.`);
  }
  
  addH3("2.4 Separation of Service Models.");
  addParagraph(`Each SOW shall identify which service model it governs (e.g., 'Project/Buyout,' 'Retainer,' 'Subscription,' 'Hourly'). The terms and conditions specific to one service model (e.g., the SLA in Section 13 for 'Subscription' SOWs) shall apply only to that SOW and not be transferable. Specifically, Services under a 'Maintenance Retainer' SOW (Section 2.3) may only be applied to custom Deliverables provided under a 'Project/Buyout' or 'Hourly' SOW, and may not be used to request modifications to a 'Subscription' Service.`);
  addH3("2.5 Acceptance of Deliverables.");
  addParagraph(`Unless otherwise set forth in the applicable SOW, Deliverables shall be deemed accepted upon the earlier of: (a) Client's written approval, or (b) ten (10) business days following Provider's delivery of the Deliverable to Client, provided Client has not provided Provider with a timely and valid written notice of non-conformity that (i) is provided within such ten (10) business day period; (ii) identifies specific, material, and objective non-conformities in reasonable detail and with sufficient information to enable Provider to reproduce and remediate the issue; and (iii) cites the specific requirement in the SOW that such non-conformity fails to meet. Vague, subjective, or general feedback (e.g., "I don't like the feel of it") shall not constitute a valid notice of non-conformity. Client's use of the Deliverable, or any portion thereof, in production shall also constitute acceptance of the Deliverable or such portion.`);

  addH2("3. CLIENT RESPONSIBILITIES");
  addH3("3.1 Client Cooperation.");
  addParagraph("Client shall provide all necessary Client Data and timely feedback required for Provider to perform the Services. Client will designate a primary contact authorized to make decisions.");
  addH3("3.2 Delays.");
  addParagraph("Provider shall not be responsible for delays caused by Client's failure to provide necessary feedback or materials in a timely manner as outlined in an SOW.");
  addH3("3.3 Stall Clause.");
  addParagraph(`If Provider is unable to proceed with the Services for a period of ten (10) consecutive business days, or for fifteen (15) aggregate business days within any single SOW project phase, as a result of a Client Delay (including, but not not limited to, failure to provide feedback, materials, or approvals), Provider may, at its option: (i) pause the project and invoice for all Services performed to date, with any associated milestone payment becoming immediately due and payable, regardless of milestone completion; and (ii) require a 'Project Reactivation Deposit' to resume the project. This deposit will be a minimum of $500 or 10% of the total SOW value (whichever is greater). This deposit is a good-faith retainer for the rescheduling of resources and will be credited in full against the Client's final invoice upon successful completion of the SOW. However, if this Agreement or the applicable SOW is terminated by Client for convenience, or by Provider for Client's breach (including any subsequent Stall), this deposit shall be forfeited by Client and retained by Provider to compensate for the costs of resource reallocation and project re-scheduling, in addition to any other payments due under Section 9.5. Upon reactivating a paused project, Provider shall not be required to reserve or guarantee its previous scheduling availability and will reschedule the project based on its then-current resource availability. Furthermore, any Stall event lasting more than thirty (30) consecutive days shall be deemed a material breach by Client, and Provider may terminate this Agreement or the applicable SOW for cause pursuant to Section 9.3. If a Stall continues for more than thirty (30) consecutive days, Provider may, in addition to any other rights or remedies, treat all remaining milestones as completed for billing purposes, and all associated payments shall become immediately due.`);
  addH3("3.4 Payment Card Data.");
  addParagraph("Client warrants that it will not transmit, store, or process any payment card industry data (PCI-DSS) on any systems, servers, or applications provided by Provider. Client agrees to use a fully compliant third-party payment gateway for all payment processing activities.");
  
  addH2("4. CONFIDENTIALITY");
  addH3("4.1 Definition.");
  addParagraph(`"Confidential Information" means all non-public information disclosed by one Party to the other that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information and the circumstances of disclosure.`);
  addH3("4.2 Obligations.");
  addParagraph("Each Party agrees to use the other's Confidential Information solely for the purpose of this Agreement and not to disclose it to any third party without prior written consent, except to employees or contractors who have a need to know and are bound by similar confidentiality obligations.");
  addH3("4.3 Survival.");
  addParagraph("These obligations shall survive for three (3) years after termination of this Agreement, or indefinitely with respect to trade secrets.");

  addH2("5. PAYMENT AND FEES");
  addH3("5.1 Fee Structures.");
  addParagraph("Client agrees to pay Provider the fees specified in each applicable SOW. Fees shall be structured according to the SOW's engagement model, as further defined in this Section.");
  addH3("5.2 Project/Buyout and Hourly/Retainer Fees.");
  addParagraph("For SOWs designated as 'Project/Buyout,' 'Hourly,' or 'Retainer,' fees shall be invoiced as specified in the SOW (e.g., upon SOW execution, upon completion of milestones, or on a monthly basis for retainers). Unless otherwise stated in the SOW, invoices are due within thirty (30) days of receipt.");
  if (data.serviceModel === "subscription") {
    addH3("5.3 Subscription Fees.");
    addParagraph("For SOWs designated as 'Subscription,' fees shall be billed to Client in recurring installments (e.g., monthly or annually) in advance. The first payment shall be due upon the SOW Effective Date or service launch date, as specified in the SOW. Subsequent recurring payments are due on the anniversary of that date (e.g., on the 1st of each month). Client may be required to maintain a valid payment method (e.g., via Stripe) on file for automatic billing.");
  }
  addH3("5.4 Late Payments.");
  addParagraph("Past due amounts shall accrue interest at 1.5% per month (or the maximum rate permitted by law, if lower), or a minimum late fee of $50, whichever is greater. Any unpaid amount shall constitute a material breach if not cured within fifteen (15) days of the due date.");
  addH3("5.5 Suspension of Services.");
  addParagraph("If any undisputed invoice is more than thirty (30) days past due, Provider may, without limiting its other rights, suspend all Services (including hosting and maintenance) until such amounts are paid in full. Provider will provide Client with at least ten (10) days' written notice before any such suspension. Provider's suspension of Services shall not be deemed a breach of this Agreement by Provider.");
  addH3("5.6 Resumption Fee.");
  addParagraph("If Services are suspended for non-payment, Provider may require a non-refundable administrative fee of $250 to cover the costs of reinstating the Services, in addition to full payment of all outstanding balances.");
  addH3("5.7 Fee Disputes.");
  addParagraph("Client may only dispute an invoice in good faith by providing specific, written details of the alleged discrepancy or non-performance within fifteen (15) days of the invoice date. Any dispute not raised within this period shall be deemed waived by Client. Client must pay the undisputed portion of the invoice by the due date. Provider reserves the right to suspend services if any undisputed portion of an invoice is thirty (30) days past due.");
  addH3("5.8 Cross-Default.");
  addParagraph("A material breach by Client under any single SOW (including, but not limited to, non-payment) shall be deemed a material breach of this Agreement and all other active SOWs. Provider shall have the right to suspend or terminate any and all Services under this Agreement and all SOWs, and to withhold any and all Deliverables, intellectual property assignments, or access to Services, regardless of Client's payment status on other SOWs, until such breach is cured and all outstanding invoices are paid in full.");
  addH3("5.9 Collection Costs.");
  addParagraph("If Provider incurs any costs in collecting overdue payments, including reasonable attorneys’ fees (whether or not formal legal action is filed), collection agency fees, or court costs, Client shall reimburse such amounts.");
  addH3("5.10 Non-Refundable Deposits.");
  addParagraph("Unless otherwise specified in an SOW, all deposits or prepayments are non-refundable once work has commenced.");

  addH2("6. INTELLECTUAL PROPERTY AND OWNERSHIP");
  addH3("6.1 Client Property.");
  addParagraph("Client shall own all right, title, and interest in and to the Client Data. Client hereby grants Provider a license to use the Client Data solely for the purpose of performing the Services.");
  addH3("6.2 Provider Property.");
  addParagraph(`Provider shall own all right, title, and interest in and to its pre-existing intellectual property, tools, and methodologies ("Provider Property"). Provider retains all ownership of any underlying libraries, frameworks, templates, or reusable components developed independently of the SOW, even if used to deliver Client’s project.`);
  addH3("6.3 Ownership of Deliverables.");
  addParagraph(`The ownership of Deliverables shall be determined by the service model specified in the applicable SOW.`);
  if (data.serviceModel === "project") {
    addParagraph(`(a) For "Project/Buyout" SOWs: Upon Provider's receipt of Client's final and full payment, Provider hereby assigns to Client all of its right, title, and interest in and to the custom-developed Deliverables. Client acknowledges that such Deliverables are the final, compiled work product and do not include Working Files unless explicitly purchased. Provider retains ownership of all Provider Property used in such Deliverables and grants Client a perpetual, irrevocable, worldwide, royalty-free, non-exclusive, fully paid-up license to use, modify, and create derivative works of such Provider Property solely as incorporated into, and for the express purpose of operating, maintaining, and modifying, the Deliverable. Provider shall identify in each SOW, as an exhibit attachment, all known and material Provider Property required for the operation of the Deliverable. If Provider fails to list a material item of Provider Property in the SOW exhibit, Provider's sole obligation shall be to grant Client the license described herein for such unlisted Provider Property; such grant shall be the Client's sole and exclusive remedy for Provider's failure to list such item. Provider’s assignment of Deliverables under Section 6.3(a) shall be self-executing upon Provider’s receipt of final payment, without need for further documentation, and Client shall execute any documents reasonably necessary to effectuate such assignment. Provider retains a perpetual, irrevocable right to use non-confidential, non-identifying elements of the Deliverables (e.g., code snippets, design patterns) in future projects.`);
  }
  if (data.serviceModel === "maintenance" || data.serviceModel === "hourly") {
    addParagraph(`(b) For "Retainer" and "Hourly" SOWs: For Services performed under a 'Maintenance Retainer' SOW or an 'Hourly Rate' SOW, all Deliverables created by Provider shall be owned by Client upon full payment for the time increments (e.g., monthly retainer fee, hourly invoice) during which the Deliverables were created, subject to the same licenses to Provider Property as described in Section 6.3(a).`);
  }
  if (data.serviceModel === "subscription") {
    addParagraph(`(c) For "Subscription" SOWs: For 'Subscription' SOWs, Client acknowledges that the Service is a hosted solution. Client has no right, title, or interest in the underlying software, Provider Property, or Deliverables, and is granted only a limited, non-exclusive, non-transferable right to access and use the Service during the term of the SOW, contingent on full payment of subscription fees.`);
  }
  addParagraph(`(d) Work-for-Hire Clarification. The Parties acknowledge that, unless otherwise specified in an SOW, the Deliverables are not "work made for hire" under the U.S. Copyright Act. Provider's assignment of rights in Section 6.3(a) and 6.3(b) is the intended mechanism for transfer of ownership.`);
  if (data.serviceModel === "subscription") {
    addParagraph(`(e) Buyout Option for Subscription SOWs. The Parties may, in a 'Subscription' SOW, define a 'Buyout Option'. The terms, pricing, and process for such an option, which would permit Client to purchase the Deliverables (as defined in that SOW) upon termination of the subscription, must be explicitly detailed in that SOW.`);
  }
  addH3("6.4 Portfolio Rights.");
  addParagraph(`Provider shall have the right to display the Deliverables in Provider's portfolio and marketing materials, unless otherwise specified in an SOW. Provider may also include Client’s name and logo in its client list and general marketing materials unless Client notifies Provider otherwise in writing. However, if Client requests in writing that a specific project be kept confidential, Provider shall use commercially reasonable efforts to remove any identifying references to Client from its portfolio and marketing materials for that specific project. Provider agrees not to publicly display or disclose any Deliverables designated in writing by Client as confidential (e.g., for a pre-launch project) until after Client's public launch of such Deliverable, or as otherwise permitted by Client in writing. In the event of a conflict between this Section and any separately executed Non-Disclosure Agreement (NDA) between the Parties, the terms of the NDA shall control.`);

  addH2("7. WARRANTIES AND DISCLAIMERS");
  addH3("7.1 Provider Warranties.");
  addParagraph("Provider warrants that the Services will be performed in a professional and workmanlike manner.");
  addH3("7.2 Client Warranties.");
  addParagraph("Client warrants that it owns or has the right to use all Client Data provided to Provider and that the Client Data does not infringe on any third-party rights.");
  addH3("7.3 Disclaimer.");
  addParagraph(`EXCEPT FOR THE EXPRESS WARRANTIES SET FORTH IN SECTIONS 7.1 AND 7.4, THE SERVICES AND DELIVERABLES ARE PROVIDED "AS IS." PROVIDER DISCLAIMS ALL OTHER WARRANTIES, EXPRESS OR IMPLIED, INCLUDING THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE. PROVIDER'S SOLE AND EXCLUSIVE REMEDY FOR BREACH OF THE WARRANTY IN SECTION 7.1 SHALL BE, AT PROVIDER'S OPTION, PROMPT RE-PERFORMANCE OF THE NON-CONFORMING SERVICES OR A REFUND OF FEES PAID FOR THE DEFICIENT SERVICES, AND CLIENT'S SOLE AND EXCLUSIVE REMEDY FOR SUCH BREACH SHALL BE LIMITED TO SUCH REMEDY.`);
  addH3("7.4 Warranty Period.");
  addParagraph(`Provider warrants that for a period of thirty (30) days following the 'Go-Live Date' (the "Warranty Period"), the Deliverable will be free from material bugs or defects, defined as any feature that does not perform in accordance with the specifications in the agreed-upon, executed SOW. The 'Go-Live Date' is defined as the date of Client's formal acceptance of the Deliverable pursuant to Section 2.5. In the absence of formal acceptance, the Go-Live Date shall be deemed to be no later than forty-five (45) days from the date Provider first delivered the substantially complete Deliverable for Client's review. This warranty does not cover, and Provider is not responsible for, issues arising from: (i) user error in content entry or management; (ii) modifications made to the Deliverable's code, core configuration, or the installation, update, or removal of any third-party plugins or software by Client or any third party (this exclusion does not apply to Client's intended use of a Content Management System solely for adding or editing text and media content); or (iii) failures of third-party software, plugins, or services (e.g., hosting, APIs). Provider's sole obligation will be to remedy any covered bug reported in writing during the Warranty Period, provided that Client grants Provider the required administrative access within two (2) business days of Provider's request. Failure to provide timely access shall void Provider's warranty obligation for that specific claim. All other requests will be considered new work and will require a new SOW or will be billed at the Provider's standard hourly rate.`);

  addH2("8. LIMITATION OF LIABILITY");
  addH3("8.1 Disclaimer of Consequential Damages.");
  addParagraph(`IN NO EVENT SHALL EITHER PARTY BE LIABLE TO THE OTHER PARTY FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES (INCLUDING BUT NOT LIMITED TO LOST PROFITS, LOST REVENUE, LOST SAVINGS, LOST DATA, OR LOST BUSINESS) ARISING OUT OF OR IN CONNECTION WITH THIS AGREEMENT, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES AND REGARDLESS OF WHETHER ANY REMEDY FAILS OF ITS ESSENTIAL PURPOSE.`);
  addH3("8.2 Limitation of Direct Damages.");
  addParagraph(`THE TOTAL AGGREGATE LIABILITY OF EITHER PARTY FOR ANY CLAIM ARISING FROM THIS AGREEMENT SHALL NOT EXCEED THE TOTAL FEES PAID OR PAYABLE BY CLIENT TO PROVIDER UNDER THE APPLICABLE SOW GIVING RISE TO THE CLAIM IN THE TWELVE (12) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM. THIS LIMITATION APPLIES REGARDLESS OF THE THEORY OF LIABILITY, WHETHER IN CONTRACT, TORT (INCLUDING NEGLIGENCE), OR OTHERWISE.`);
  addH3("8.3 Limitation Carve-Outs.");
  addParagraph("The limitations of liability set forth in Section 8.2 shall not apply to either Party’s indemnification obligations under Section 10, a breach of confidentiality obligations under Section 4, Client's payment obligations, or claims arising from a Party's gross negligence or willful misconduct.");
  addH3("8.4 Limitation for Data Loss.");
  addParagraph("Provider’s total liability for any data loss or corruption shall be limited to the fees paid for the month in which the loss occurred.");

  addH2("9. TERM AND TERMINATION");
  addH3("9.1 Term of Agreement.");
  addParagraph("This Agreement shall commence on the Effective Date and shall remain in effect as long as any SOW is active. Upon expiration of all SOWs, this Agreement shall remain in effect for one (1) year solely for purposes of governing any new SOWs executed during that period. Individual SOWs shall specify their own term (e.g., an initial term for a subscription, or the duration of a project).");
  if (data.serviceModel === "subscription") {
    addH3("9.2 Subscription SOW Term.");
    addParagraph("Unless otherwise specified in the applicable SOW, each 'Subscription' SOW shall have an 'Initial Term' of twelve (12) months. Upon expiration of the Initial Term, the SOW shall automatically renew for successive one (1) month periods (each a 'Renewal Term') unless either Party provides written notice of non-renewal at least thirty (30) days prior to the end of the then-current term.");
  }
  addH3("9.3 Termination for Cause.");
  addParagraph("Either Party may terminate this Agreement for a material breach that is not cured within thirty (30) days of written notice. Provider may also terminate this Agreement or any SOW immediately upon written notice if Client experiences two (2) or more Stalls under Section 3.3 or otherwise materially delays performance. Provider may terminate this Agreement or any SOW immediately upon written notice if any undisputed payment remains unpaid more than forty-five (45) days after the due date.");
  addH3("9.4 Termination for Convenience.");
  addParagraph("For any SOW, Client may terminate for convenience upon thirty (30) days' written notice, subject to the payment obligations in Section 9.5. Subscription SOWs may define a specific initial term (e.g., 12 months) and any applicable early termination fees or notice periods for non-renewal.");
  addH3("9.5 Effect of Termination.");
  addParagraph("(a) Upon any termination, Client shall pay Provider for all Services performed and expenses incurred up to the effective date of termination.\n(b) In the event of a termination by Client for convenience for a \"Project / Buyout\" SOW, payment shall be handled as follows: Client shall pay Provider for (i) the full value of all project milestones completed to date, plus (ii) the full value of any milestone currently in progress, regardless of percentage of completion. Client's payment for all such milestones shall be due upon the effective date of termination.\n(c) Upon termination of a \"Subscription\" SOW, Client's license and right to access the Service shall immediately cease. Client is responsible for any fees owed for the remainder of the agreed-upon term, unless otherwise specified in the SOW or terminated for cause by Client. Data will be handled as specified in Section 14.");
  
  addH2("10. INDEMNIFICATION");
  addH3("10.1 Indemnification by Client.");
  addParagraph(`Client agrees to indemnify, defend, and hold harmless Provider and its officers, members, and employees from and against any and all claims, liabilities, damages, losses, and expenses (including reasonable attorneys' fees) arising out of or in connection with any third-party claim alleging that the Client Data or other materials provided by Client for use in the Services infringe upon or misappropriate any third party's intellectual property rights, including copyright, trademark, or patent.`);
  addH3("10.2 Indemnification by Provider.");
  addParagraph(`Provider agrees to indemnify, defend, and hold harmless Client from and against any and all claims, liabilities, damages, losses, and expenses (including reasonable attorneys' fees) arising out of or in connection with any third-party claim alleging that the Deliverables or Provider Property (excluding any Client Data and third-party materials) infringe upon or misappropriate any third party's intellectual property rights; provided, however, that Provider shall have no obligation under this Section 10.2 for any claim arising from: (a) Client Data; (b) any Third-Party Materials (as defined in 12.15) or third-party services (as defined in 12.9); (c) any AI-generated Outputs (as defined in 12.10); (d) Client's modification of the Deliverable; or (e) the combination of the Deliverable with any other product or service not provided by Provider.`);
  addH3("10.3 Indemnification Procedure.");
  addParagraph(`The Party seeking indemnification (the "Indemnified Party") shall: (a) provide the other Party (the "Indemnifying Party") with prompt written notice of the claim; (b) grant the Indemnifying Party sole control over the defense and settlement of such claim; and (c) provide reasonable cooperation and assistance, at the Indemnifying Party's expense; provided, however, that the Indemnifying Party shall not agree to any settlement that (i) admits fault, liability, or wrongdoing on behalf of the Indemnified Party, or (ii) imposes any non-monetary obligation on the Indemnified Party, without the Indemnified Party's prior written consent, which consent shall not be unreasonably withheld.`);
  addH3("10.4 Additional Indemnity Limitations.");
  addParagraph("Notwithstanding anything to the contrary, neither Party shall be required to indemnify the other for liabilities arising out of the other Party's own negligence, willful misconduct, or breach of this Agreement. Provider's indemnity obligations for third-party claims shall be limited to claims for which Provider is reasonably determined to be at fault based on applicable law. Provider shall not be responsible for indemnifying Client for claims arising from Client's conduct, misuse of the Deliverable, or Client's failure to follow Provider's written instructions or reasonable security practices.");
  addH3("10.5 Liability Cap on Indemnification.");
  addParagraph("NOTWITHSTANDING SECTION 8.2, PROVIDER’S TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS AND OBLIGATIONS ARISING UNDER SECTION 10.2 SHALL NOT EXCEED THE GREATER OF (i) THE TOTAL FEES PAID BY CLIENT TO PROVIDER UNDER THE APPLICABLE SOW GIVING RISE TO THE CLAIM IN THE TWELVE (12) MONTHS PRECEDING THE EVENT, OR (ii) THE PER-OCCURRENCE LIMIT OF PROVIDER’S THEN-IN-FORCE PROFESSIONAL LIABILITY (ERRORS & OMISSIONS) INSURANCE POLICY.");

  addH2("11. DATA SECURITY");
  addH3("11.1 Security Measures.");
  addParagraph(`Provider will implement and maintain commercially reasonable administrative, physical, and technical safeguards to protect any Client Data stored on systems under Provider's direct control from unauthorized access or use. For the avoidance of doubt, "commercially reasonable safeguards" include, but are not limited to, access controls, password protection, regular software updates, routine backups, and security monitoring appropriate to the nature and size of the Services. Advanced security services such as penetration testing, dedicated vulnerability scanning, SOC 2 certification, or ISO 27001 compliance are not included unless expressly agreed in writing. Client acknowledges that the security of data also depends on Client's own security practices (such as password management) and the security of third-party services (such as hosting).`);
  addH3("11.2 Data Breach Notification.");
  addParagraph("In the event of a security breach involving Client Data that is known to Provider, Provider shall notify Client without undue delay, and in no event later than five (5) business days after discovery of a confirmed security breach. Provider's notification obligation is limited to breaches of systems under Provider's direct control. Provider shall cooperate in good faith with Client to investigate the breach and take reasonable steps to mitigate its effects. Client is solely responsible for determining its legal obligations under applicable data privacy laws, including any obligations to notify affected individuals or regulatory authorities. Provider's cooperation shall not be construed as an admission of fault or liability. Provider shall not be liable for any data loss, unauthorized access, or breach of security except to the extent directly caused by Provider's gross negligence or willful misconduct. Client agrees to promptly notify Provider of any suspected security breach on Client's systems that may reasonably affect Provider or the Services.");
  addH3("11.3 Data Processing.");
  addParagraph(`To the extent Provider processes any Personal Information (as defined by applicable law) on behalf of Client, the Parties agree to be bound by the terms of the Data Processing Addendum ("DPA"), which is attached hereto as Exhibit A and hereby incorporated by reference into this Agreement. The DPA includes terms to address cross-border data transfers, applicable European Union data protection requirements (including GDPR Article 28 processor obligations), and any additional data protection measures required by applicable law. In the event of a conflict between this Agreement and the DPA, the DPA shall control with respect to data protection matters.`);

  addH2("12. GENERAL PROVISIONS");
  addH3("12.1 Independent Contractor.");
  addParagraph("The relationship of the Parties is that of independent contractors. Nothing in this Agreement shall be construed to create a partnership, joint venture, fiduciary, or employment relationship between the Parties.");
  addH3("12.2 Governing Law and Venue.");
  addParagraph("This Agreement shall be governed by the laws of the State of California. The exclusive venue for any dispute shall be the state courts of Riverside County, California, and the Parties waive any right to remove or transfer to federal court.");
  addH3("12.3 Entire Agreement.");
  addParagraph("This Agreement, together with all executed SOWs, constitutes the entire agreement between the Parties and supersedes all prior agreements.");
  addH3("12.4 Order of Precedence.");
  addParagraph("In the event of a conflict between this Agreement, a Statement of Work, or any other document incorporated by reference, the following order shall apply: (1) A Statement of Work (only if it expressly identifies the specific section of this Agreement to be modified and explicitly states its intent to override it, referencing this Section 12.4); (2) this Agreement; (3) any exhibits or attachments.");
  addH3("12.5 Counterparts.");
  addParagraph("This Agreement may be executed in counterparts, including by electronic signature (such as DocuSign or other platforms compliant with ESIGN and UETA).");
  addH3("12.6 Dispute Resolution.");
  addParagraph("The Parties agree to resolve any dispute arising out of this Agreement through good-faith negotiation. If the Parties are unable to resolve the dispute within thirty (30) days from the first written notice of the dispute, they agree to submit the dispute to formal, non-binding mediation with a single mediator mutually agreed upon by the Parties. The costs of mediation shall be shared equally between the Parties. If mediation fails, any dispute shall be resolved by binding arbitration administered by JAMS under its Comprehensive Arbitration Rules and Procedures. Such arbitration shall be final and binding, with limited judicial review under the Federal Arbitration Act (FAA). Each Party shall bear its own attorneys’ fees, and the arbitration costs shall be shared equally. Judgment on the arbitration award may be entered in any court of competent jurisdiction. Such arbitration shall be held in Riverside County, California, and the arbitrator’s award shall be final and binding on the Parties. This obligation to mediate and arbitrate shall not apply to claims that qualify for small claims court, nor shall it prevent either Party from, seeking immediate injunctive or other equitable relief from a court of competent jurisdiction to protect its Confidential Information or intellectual property rights.");
  addH3("12.7 No Third-Party Beneficiaries.");
  addParagraph("This Agreement is for the sole benefit of the Parties hereto and their respective successors and permitted assigns and nothing herein, express or implied, is intended to or shall confer upon any other person or entity any legal or equitable right, benefit, or remedy of any nature whatsoever under or by reason of this Agreement.");
  addH3("12.8 Subcontractors.");
  addParagraph("Provider may engage subcontractors to perform portions of the Services. Provider shall remain fully responsible for the performance of its obligations under this Agreement and for the work and conduct of its subcontractors as if they were Provider's own employees. Provider will ensure that any subcontractor with access to Client's Confidential Information has entered into a written agreement with confidentiality obligations no less restrictive than those set forth in this Agreement. Provider shall use commercially reasonable efforts to cause any subcontractor to maintain insurance coverage consistent with Provider's obligations under Section 12.18 and to include flow-down obligations that require subcontractors to comply with the applicable provisions of this Agreement.");
  addH3("12.9 Third-Party Services.");
  addParagraph("The Services may integrate with or rely on third-party services, APIs, or platforms (e.g., hosting, payment gateways, social media feeds). Provider is not responsible for the performance, availability, or security of any third-party service. Client acknowledges that any work required to address changes, updates, or deprecations by a third-party service provider (e.g., migrating to a new API) is not considered a warranty item and will be treated as new work, billable at Provider's then-current hourly rate or under a new SOW.");
  addH3("12.10 Use of Artificial Intelligence.");
  addParagraph(`Client may request the integration of services that utilize artificial intelligence ("AI"). Client acknowledges and agrees to the following: (a) AI systems may produce inaccurate, biased, or unexpected outputs ("Outputs"). (b) Provider is not responsible for the accuracy, reliability, or appropriateness of any AI-generated Outputs. (c) Client is solely responsible for the review, use, and consequences of any decisions made based on the AI Outputs, including ensuring compliance with all applicable laws regarding hiring, discrimination, and data privacy. Provider's sole obligation is to properly implement the technical integration of the AI service. Client further acknowledges that Provider does not grant any rights in the AI-generated Outputs beyond those rights which the originating AI service provider grants to Client via its own license or terms of use. Client shall ensure that all AI Outputs are reviewed and approved prior to public use, and Provider shall not be liable for any infringement, bias, or legal non-compliance arising therefrom.`);
  addH3("12.11 Compliance with Laws.");
  addParagraph("Provider will make commercially reasonable efforts to ensure the Deliverables comply with generally accepted web accessibility standards (such as WCAG) at the time of launch. However, Provider makes no representation or legal warranty of compliance with any specific accessibility law, including the Americans with Disabilities Act (ADA). Client is solely responsible for determining the legal and regulatory requirements applicable to its business and for the ongoing compliance of the website and all its content. Client agrees to indemnify, defend, and hold harmless Provider from any and all claims, damages, and costs arising from or related to accessibility-related claims against the Deliverable, particularly those claims arising from or related to content provided by Client or modifications made to the Deliverable by Client or its agents after the Warranty Period. Any work required to remediate or bring a Deliverable into compliance with a specific legal standard after launch will be treated as new work and billed separately.");
  addH3("12.12 Non-Solicitation.");
  addParagraph("During the term of any active SOW and for a period of six (6) months thereafter, Client agrees not to directly or indirectly solicit for employment or engagement any of Provider’s employees or contractors with whom Client has had direct contact in connection with this Agreement. During this same period, Client also agrees not to directly or indirectly solicit for competing business any of Provider’s clients with whom Client has had contact as a direct result of its relationship with Provider under this Agreement.");
  addH3("12.13 Hosting and Domain Name.");
  addParagraph(`Unless Provider is expressly engaged to provide hosting services under a "Subscription" or "Maintenance Retainer" SOW, Client is solely responsible for procuring, configuring, and maintaining its own third-party hosting environment and domain name registration. Provider is not responsible for any failures, downtime, security issues, or performance degradation arising from the Client's hosting provider or domain registrar.`);
  addH3("12.14 Modifications by Client.");
  addParagraph("If Client or any of its agents modifies the code or core configuration of the Deliverables after the final handover, or installs, updates, or removes any third-party software, themes, or plugins not originally installed by Provider, any and all warranties provided by Provider under this Agreement, including the Warranty Period, shall be immediately voided. This does not apply to Client's use of the Deliverable's intended administrative functions, solely for the purpose of adding or editing text and media content via the Content Management System (CMS). Provider shall have no responsibility or liability for issues arising from any modifications made by Client or third parties after delivery.");
  addH3("12.15 Third-Party Licenses and Fees.");
  addParagraph(`Provider may identify third-party software, plugins, or other licensed materials ("Third-Party Materials") to build the Deliverables. Client is solely responsible for procuring and paying all license fees for such Third-Party Materials, and Client shall own such licenses directly. As a convenience, Provider may purchase such licenses on Client's behalf, and Client agrees to reimburse Provider in full for all such costs. Client is solely responsible for all future renewal fees, licensing costs, and compliance with the terms of all Third-Party Materials.`);
  addH3("12.16 Force Majeure.");
  addParagraph(`Neither Party shall be liable for any delay or failure to perform its obligations hereunder if such delay or failure is due to a cause beyond its reasonable control, including but not limited to acts of God, war, terrorism, labor disputes, government orders, pandemics, or natural disasters ("Force Majeure Event"). The affected Party shall provide prompt written notice to the other Party. The timeline for performance shall be automatically extended for the duration of the Force Majeure Event. If such an event continues for more than thirty (30) days, either Party may terminate the applicable SOW upon written notice.`);
  addH3("12.17 Assignment and Successors.");
  addParagraph("Neither Party may assign or transfer this Agreement or any SOW, in whole or in part, without the prior written consent of the other Party; provided, however, that Client may assign this Agreement without Provider's consent to a successor entity in connection with a merger, acquisition, or sale of substantially all of Client's assets, provided such successor assumes in writing all of Client's obligations hereunder. Provider may assign this Agreement to an affiliate or successor entity in connection with a merger, acquisition, or sale of its business. Any attempted assignment in violation of this Section shall be void.");
  addH3("12.18 Insurance.");
  addParagraph("Provider shall maintain, at its expense, commercial general liability insurance with limits of not less than $1,000,000 per occurrence and $2,000,000 aggregate, and professional liability (errors & omissions) insurance with limits of not less than $1,000,000. If Provider or its subcontractors process or store sensitive personal information or payment data, Provider shall maintain cyber/privacy insurance with limits of not less than $500,000. Provider shall, upon Client's written request, no more than once annually, provide certificates of insurance evidencing such coverage. Provider's subcontractors shall be required to maintain appropriate insurance coverage and include flow-down insurance obligations where reasonably practicable. Provider’s maintenance of insurance shall not be construed to expand its liability beyond the limits set forth in this Agreement. Provider shall maintain such coverage during the term of this Agreement and for one (1) year thereafter. Failure to maintain such insurance shall be a material breach of this Agreement, subject to immediate termination if not cured within ten (10) business days of written notice.");
  addH3("12.19 Survival.");
  addParagraph("All payment obligations accrued prior to termination shall survive termination or expiration. Sections 4, 5, 6, 7, 8, 9.5, 10, 11, and 12 shall also survive termination or expiration of this Agreement.");
  addH3("12.20 Notices.");
  addParagraph("All notices required under this Agreement shall be in writing and deemed given when delivered by certified mail, courier, or email (to the designated contact address listed in the applicable SOW). Notices by email shall be deemed received one (1) business day after transmission, provided no automated bounce-back or delivery failure message is received by the sender.");
  addH3("12.21 Severability.");
  addParagraph("If any provision of this Agreement is found invalid or unenforceable, the remaining provisions shall remain in full force and effect.");
  addH3("12.22 Waiver.");
  addParagraph("No waiver of any breach shall be deemed a waiver of any subsequent breach.");
  addH3("12.23 Mutual Non-Disparagement.");
  addParagraph("During the term of this Agreement and for a period of one (1) year thereafter, both Parties agree not to make any false or derogatory public or online statements about the other Party, its business, officers, or employees, that would reasonably be expected to harm the other Party's reputation. This provision shall not be construed to prohibit truthful statements required by law or legal process.");
  addH3("12.24 Cumulative Remedies.");
  addParagraph("The rights and remedies provided under this Agreement are cumulative and are in addition to and not in substitution for any other rights and remedies available at law or in equity.");
  addH3("12.25 Headings.");
  addParagraph("The headings in this Agreement are for convenience only and shall not affect its interpretation.");
  addH3("12.26 Attorneys' Fees.");
  addParagraph("In any dispute, mediation, arbitration, or litigation arising out of or related to this Agreement, the prevailing Party shall be entitled to recover its reasonable attorneys’ fees and costs, in addition to any other relief to which it may be entitled.");

  if (data.serviceModel === "subscription") {
    addH2("13. SERVICE LEVEL AGREEMENT (SLA)");
    addH3("13.1 Exhibit B.");
    addParagraph(`This section applies only to Services provided under a "Subscription" SOW. All such Subscription Services are subject to the terms of the Service Level Agreement ("SLA"), which is attached hereto as Exhibit B and incorporated by reference into this Agreement. The terms of the SLA (Exhibit B) shall govern service availability, support, and maintenance for Subscription Services and shall not apply to any other engagement model.`);

    addH2("14. DATA PORTABILITY & DELETION");
    addH3("14.1 Data Export.");
    addParagraph(`This section applies only to Services provided under a "Subscription" SOW. Upon Client's written request within thirty (30) days following the effective date of termination, Provider will make Client Data available for export in one or more non-proprietary, flat-file formats (such as CSV or JSON). Provider has no obligation to export data in any other format, to preserve relational database structures, or to assist in migrating Client Data to any third-party platform.`);
    addH3("14.2 Data Retention and Deletion.");
    addParagraph("Provider will have no obligation to maintain or provide any Client Data after the thirty (30) day period described in Section 14.1. Following this period, Provider will permanently and securely delete all Client Data from its systems in accordance with its data retention policies.");

    addH2("15. DATA BACKUP AND RECOVERY");
    addH3("15.1 Backups.");
    addParagraph(`Provider will implement and maintain regular backups of Client Data stored on the Services. Backups are performed on a twenty-four (24) hour cycle (the "Recovery Point Objective" or "RPO"). While Provider will use commercially reasonable efforts to ensure the integrity of backups, Provider does not guarantee that a backup will be complete or error-free.`);
    addH3("15.2 Disaster Recovery.");
    addParagraph(`In the event of a catastrophic data loss, Provider will use commercially reasonable efforts to restore the Service from the most recent available backup. Provider's target for service restoration is eight (8) business hours from the time the failure is identified (the "Recovery Time Objective" or "RTO"). This RTO is an internal target and not a binding guarantee. Provider's failure to meet the RTO shall not be grounds for a material breach. Client's sole and exclusive remedy for any downtime, regardless of cause, shall be the Service Credits set forth in Section 13. Client acknowledges that any data created between the last successful backup and the time of the failure may be permanently lost.`);
    addH3("15.3 Client's Responsibility.");
    addParagraph("For critical or sensitive data, Client is encouraged to maintain its own separate backups or records. Provider shall not be liable for any damages, including lost profits or lost data, resulting from a data loss event.");

    addH2("16. ACCEPTABLE USE POLICY (AUP)");
    addH3("16.1 Prohibited Uses.");
    addParagraph(`This AUP applies only to Services provided under a "Subscription" SOW. Client agrees not to use the Services to:\n(a) Send unsolicited communications, promotions, or advertisements (spam).\n(b) Store or transmit any content that is infringing, libelous, unlawful, or in violation of any third-party's rights.\n(c) Transmit any malicious code, such as viruses or worms.\n(d) Attempt to gain unauthorized access to the Services, other accounts, or computer systems.\n(e) Interfere with or disrupt the integrity or performance of the Services or the data contained therein.`);
    addH3("16.2 Right to Suspend.");
    addParagraph("Provider may, without limiting its other rights, immediately suspend Client's access to the Services if Client breaches this AUP. Provider will provide Client with notice of the suspension and an opportunity to remedy the breach, where applicable.");
  }
  
  pdfState.y -= (LINE_GAP.body * 1.5); // Add space
  addH3("Attorney Review.");
  addParagraph("Each Party acknowledges that it has had the opportunity to consult with independent legal counsel regarding this Agreement. Accordingly, this Agreement shall not be construed against either Party as the drafter.");
  addSignatureBlocks(data);
};

/**
 * Draws the SLA content
 */
const drawSLA = (data) => {
  createPage(); // Start SLA on a new page
  addTitle("Service Level Agreement (SLA)");
  addH3("Exhibit B to Master Service Agreement");

  addParagraph(`This Service Level Agreement ("SLA") outlines the specific levels of service, support, and maintenance provided by ${data.companyName} ("Provider") to ${data.clientLegalName} ("Client") for Subscription Services engaged under the Master Service Agreement ("MSA") dated ${data.today} and the relevant Statement of Work ("SOW") dated ${data.today}.`);
  addParagraph("This SLA applies only during the active term of a Subscription Service SOW.");

  addH2("1. Included Maintenance Services");
  addParagraph("Provider will perform the following routine maintenance services for the Client's hosted website/application covered under the Subscription Service:");
  addList([
    "Software Updates: Apply necessary updates and patches to the core Content Management System (CMS), themes, plugins, or underlying server software ([e.g., monthly, quarterly]).",
    "Security Monitoring & Hardening: Employ reasonable measures to monitor for and protect against common security threats. ([Describe briefly, e.g., basic firewall, malware scans]).",
    "Backups: Perform regular backups of the website/application data ([e.g., daily, weekly]) with a defined retention period ([e.g., 14 days]).",
    "Uptime Monitoring: Provider will monitor the general availability of the hosted service.",
  ]);
  
  addH2("2. Included Support Services");
  addParagraph("Provider will provide technical support related to the functioning of the hosted website/application:");
  addList([
    "Support Channels: Support requests may be submitted via [e.g., Email to support@lantingdigital.com, Client Portal Link].",
    "Support Hours: Support is available [e.g., Monday - Friday, 9:00 AM - 5:00 PM Pacific Time], excluding Provider holidays.",
    "Included Support Time: The subscription fee includes up to [e.g., 1 hour] of support time per month for minor content updates (e.g., text changes, image swaps), bug fixes related to included maintenance, or general inquiries. Unused time does not roll over.",
    "Additional Support: Work exceeding the included monthly time, or work related to new features, major design changes, or third-party integrations not covered by the original SOW, will be considered outside the scope of this SLA and will require a separate quote or SOW at Provider's then-current hourly rate ([e.g., $100/hour]).",
  ]);

  addH2("3. Response Time Targets");
  addParagraph("Provider will use commercially reasonable efforts to acknowledge receipt of support requests submitted through the designated channels within the following timeframes during Support Hours:");
  addList([
      "Critical Issues (e.g., Website/Application Down): Target acknowledgement within [e.g., 2-4] business hours.",
      "Standard Issues (e.g., Minor bug, Content update request): Target acknowledgement within [e.g., 1] business day.",
  ]);
  addParagraph("Acknowledgement means confirming receipt of the request and potentially providing an initial assessment or request for more information. Resolution times will vary based on the complexity of the issue.", { font: pdfState.fonts.helveticaOblique });

  addH2("4. Service Availability (Uptime) - If Hosting Included");
  addParagraph("Provider will use commercially reasonable efforts to ensure the hosted Subscription Service is available [e.g., 99.5%] of the time each calendar month, excluding scheduled maintenance windows and circumstances beyond Provider's reasonable control (Force Majeure, Client-caused issues, third-party network failures).");
  addParagraph("Scheduled maintenance will be performed during low-traffic hours ([e.g., typically between 10:00 PM and 4:00 AM Pacific Time]) whenever possible, with advance notice provided for significant updates.");
  addParagraph("(Optional: Define remedies if uptime target is missed, e.g., service credits. Keep it simple to start).", { font: pdfState.fonts.helveticaOblique });
  
  addH2("5. Exclusions");
  addParagraph("This SLA does not cover issues arising from:");
  addList([
    "Client modifications to the website/application code or server settings.",
    "Improper use of the website/application by Client or its users.",
    "Failures of third-party software, services, or APIs not directly managed by Provider (unless their maintenance is explicitly included in the SOW).",
    "Client hardware, software, or network connectivity issues.",
    "Development of new features or significant enhancements beyond routine maintenance and included support time.",
    "Training, content creation, graphic design, or SEO services unless specified in the SOW.",
  ]);

  addH2("6. Modifications");
  addParagraph("Provider reserves the right to update this SLA upon [e.g., 30 days'] written notice to Client. Continued use of the Subscription Service after such notice constitutes acceptance of the updated SLA.");
  
  addParagraph("This SLA is referenced by and forms part of the Master Service Agreement.", { font: pdfState.fonts.helveticaOblique });
};

/**
 * Draws the DPA content
 */
const drawDPA = (data) => {
  createPage(); // Start DPA on a new page
  addTitle("Data Processing Agreement (DPA)");
  addH3("Exhibit A to Master Service Agreement");

  addParagraph(`This Data Processing Agreement ("Agreement") forms part of the Contract for Services ("Principal Agreement"), which is the Master Service Agreement between the Parties,`);
  addParagraph("BETWEEN:");
  addParagraph(`${data.clientLegalName} (the "Company" or "Controller")`, { font: pdfState.fonts.helveticaBold });
  addParagraph("AND:");
  addParagraph(`${data.companyName} (the "Data Processor" or "Provider")`, { font: pdfState.fonts.helveticaBold });
  addParagraph(`(together as the "Parties")`);
  
  addH2("WHEREAS");
  addList([
    "(A) The Company acts as a Data Controller.",
    "(B) The Company wishes to subcontract certain Services, which imply the processing of personal data, to the Data Processor.",
    "(C) The Parties seek to implement a data processing agreement that complies with the requirements of the current legal framework in relation to data processing and with the Regulation (EU) 2016/679 of the European Parliament and of the Council of 27 April 2016 on the protection of natural persons with regard to the processing of personal data and on the free movement of such data, and repealing Directive 95/46/EC (General Data Protection Regulation).",
    "(D) The Parties wish to lay down their rights and obligations.",
  ]);

  addParagraph("IT IS AGREED AS FOLLOWS:");
  
  addH2("1. Definitions and Interpretation");
  addH3("1.1");
  addParagraph(`Unless otherwise defined herein, capitalized terms and expressions used in this Agreement shall have the following meaning:`);
  addParagraph(`1.1.1 "Agreement" means this Data Processing Agreement and all Schedules;`);
  addParagraph(`1.1.2 "Company Personal Data" means any Personal Data Processed by a Contracted Processor on behalf of Company pursuant to or in connection with the Principal Agreement;`);
  addParagraph(`1.1.3 "Contracted Processor" means a Subprocessor;`);
  addParagraph(`1.1.4 "Data Protection Laws" means EU Data Protection Laws and, to the extent applicable, the data protection or privacy laws of any other country;`);
  addParagraph(`1.1.5 "EEA" means the European Economic Area;`);
  addParagraph(`1.1.6 "EU Data Protection Laws" means EU Directive 95/46/EC, as transposed into domestic legislation of each Member State and as amended, replaced or superseded from time to time, including by the GDPR and laws implementing or supplementing the GDPR;`);
  addParagraph(`1.1.7 "GDPR" means EU General Data Protection Regulation 2016/679;`);
  addParagraph(`1.1.8 "Data Transfer" means: \n 1.1.8.1 a transfer of Company Personal Data from the Company to a Contracted Processor; or \n 1.1.8.2 an onward transfer of Company Personal Data from a Contracted Processor to a Subcontracted Processor, or between two establishments of a Contracted Processor, in each case, where such transfer would be prohibited by Data Protection Laws (or by the terms of data transfer agreements put in place to address the data transfer restrictions of Data Protection Laws);`);
  addParagraph(`1.1.9 "Services" means the services the Provider provides.`);
  addParagraph(`1.1.10 "Subprocessor" means any person appointed by or on behalf of Processor to process Personal Data on behalf of the Company in connection with the Agreement.`);
  addH3("1.2");
  addParagraph(`The terms, "Commission", "Controller", "Data Subject", "Member State", "Personal Data", "Personal Data Breach", "Processing" and "Supervisory Authority" shall have the same meaning as in the GDPR, and their cognate terms shall be construed accordingly.`);

  addH2("2. Processing of Company Personal Data");
  addH3("2.1");
  addParagraph("Processor shall:\n2.1.1 comply with all applicable Data Protection Laws in the Processing of Company Personal Data; and\n2.1.2 not Process Company Personal Data other than on the relevant Company's documented instructions.");
  addH3("2.2");
  addParagraph("The Company instructs Processor to process Company Personal Data as described in Schedule 1 (Details of Processing) attached hereto.");
  
  addH2("3. Processor Personnel");
  addParagraph("Processor shall take reasonable steps to ensure the reliability of any employee, agent or contractor of any Contracted Processor who may have access to the Company Personal Data, ensuring in each case that access is strictly limited to those individuals who need to know / access the relevant Company Personal Data, as strictly necessary for the purposes of the Principal Agreement, and to comply with Applicable Laws in the context of that individual's duties to the Contracted Processor, ensuring that all such individuals are subject to confidentiality undertakings or professional or statutory obligations of confidentiality.");

  addH2("4. Security");
  addH3("4.1");
  addParagraph("Taking into account the state of the art, the costs of implementation and the nature, scope, context and purposes of Processing as well as the risk of varying likelihood and severity for the rights and freedoms of natural persons, Processor shall in relation to the Company Personal Data implement appropriate technical and organizational measures to ensure a level of security appropriate to that risk, including, as appropriate, the measures referred to in Article 32(1) of the GDPR.");
  addH3("4.2");
  addParagraph("In assessing the appropriate level of security, Processor shall take account in particular of the risks that are presented by Processing, in particular from a Personal Data Breach.");

  addH2("5. Subprocessing");
  addH3("5.1");
  addParagraph("Processor shall not appoint (or disclose any Company Personal Data to) any Subprocessor unless required or authorized by the Company. The Company provides general written authorization for the Processor to engage the Subprocessors listed in Schedule 2 (Authorized Subprocessors) attached hereto. The Processor shall notify the Controller of any intended changes concerning the addition or replacement of other sub-processors, thereby giving the Controller the opportunity to object to such changes.");
  
  addH2("6. Data Subject Rights");
  addH3("6.1");
  addParagraph("Taking into account the nature of the Processing, Processor shall assist the Company by implementing appropriate technical and organisational measures, insofar as this is possible, for the fulfilment of the Company obligations, as reasonably understood by Company, to respond to requests to exercise Data Subject rights under the Data Protection Laws.");
  addH3("6.2");
  addParagraph("Processor shall:\n6.2.1 promptly notify Company if it receives a request from a Data Subject under any Data Protection Law in respect of Company Personal Data; and\n6.2.2 ensure that it does not respond to that request except on the documented instructions of Company or as required by Applicable Laws to which the Processor is subject, in which case Processor shall to the extent permitted by Applicable Laws inform Company of that legal requirement before the Contracted Processor responds to the request.");
  
  addH2("7. Personal Data Breach");
  addH3("7.1");
  addParagraph("Processor shall notify Company without undue delay upon Processor becoming aware of a Personal Data Breach affecting Company Personal Data, providing Company with sufficient information to allow the Company to meet any obligations to report or inform Data Subjects of the Personal Data Breach under the Data Protection Laws.");
  addH3("7.2");
  addParagraph("Processor shall co-operate with the Company and take reasonable commercial steps as are directed by Company to assist in the investigation, mitigation and remediation of each such Personal Data Breach.");
  
  addH2("8. Data Protection Impact Assessment and Prior Consultation");
  addParagraph("Processor shall provide reasonable assistance to the Company with any data protection impact assessments, and prior consultations with Supervising Authorities or other competent data privacy authorities, which Company reasonably considers to be required by article 35 or 36 of the GDPR or equivalent provisions of any other Data Protection Law, in each case solely in relation to Processing of Company Personal Data by, and taking into account the nature of the Processing and information available to, the Contracted Processors.");

  addH2("9. Deletion or return of Company Personal Data");
  addH3("9.1");
  addParagraph("Processor shall make Company Personal Data available for export and subsequently delete all copies of Company Personal Data in accordance with the terms of the Principal Agreement, including but not limited to Section 14 of the Principal Agreement.");
  addH3("9.2");
  addParagraph("Processor shall provide written certification to Company that it has fully complied with this section 9 within 10 business days of the Cessation Date (as defined in the Principal Agreement) or upon Company's request.");

  addH2("10. Audit rights");
  addH3("10.1");
  addParagraph("Subject to this section 10, Processor shall make available to the Company on request all information necessary to demonstrate compliance with this Agreement, and shall allow for and contribute to audits, including inspections, by the Company or an auditor mandated by the Company in relation to the Processing of the Company Personal Data by the Contracted Processors.");
  addH3("10.2");
  addParagraph("Information and audit rights of the Company only arise under section 10.1 to the extent that the Agreement does not otherwise give them information and audit rights meeting the relevant requirements of Data Protection Law.");
  
  addH2("11. Data Transfer");
  addH3("11.1");
  addParagraph("The Processor may not transfer or authorize the transfer of Data to countries outside the EU and/or the European Economic Area (EEA) without the prior written consent of the Company. If personal data processed under this Agreement is transferred from a country within the European Economic Area to a country outside the European Economic Area, the Parties shall ensure that the personal data are adequately protected. To achieve this, the Parties shall, unless agreed otherwise, rely on EU approved standard contractual clauses for the transfer of personal data.");

  addH2("12. General Terms");
  addH3("12.1 Confidentiality.");
  addParagraph(`Each Party must keep this Agreement and information it receives about the other Party and its business in connection with this Agreement ("Confidential Information") confidential and must not use or disclose that Confidential Information without the prior written consent of the other Party except to the extent that: (a) disclosure is required by law; or (b) the relevant information is already in the public domain.`);
  addH3("12.2 Notices.");
  addParagraph("All notices and communications given under this Agreement must be in writing and will be delivered personally, sent by post or sent by email to the address or email address set out in the heading of this Agreement or the Principal Agreement, at such other address as notified from time to time by the Parties changing address.");
  
  addH2("13. Governing Law and Jurisdiction");
  addH3("13.1");
  addParagraph("This Agreement is governed by the laws of the State of California.");
  addH3("13.2");
  addParagraph("Any dispute arising in connection with this Agreement, which the Parties will not be able to resolve amicably, will be submitted to the exclusive jurisdiction of the state courts of Riverside County, California.");

  addH2("Schedule 1: Details of Processing");
  addParagraph("Nature and Purpose of Processing:", { font: pdfState.fonts.helveticaBold });
  addParagraph("To provide hosted website, application, database, and authentication services to the Company as outlined in the Principal Agreement and relevant SOWs.");
  addParagraph("Categories of Data Subjects:", { font: pdfState.fonts.helveticaBold });
  addParagraph("End-users of the Company's services (e.g., website visitors, customers, clients, or employees).");
  addParagraph("Categories of Personal Data:", { font: pdfState.fonts.helveticaBold });
  addParagraph("Data collected via the website or application, which may include names, email addresses, phone numbers, IP addresses, and any other data the Company instructs the Processor to collect via its services (e.g., form submissions).");
  addParagraph("Duration of Processing:", { font: pdfState.fonts.helveticaBold });
  addParagraph("For the duration of the applicable SOW, subject to the data deletion provisions of the Principal Agreement.");

  addH2("Schedule 2: Authorized Subprocessors");
  addParagraph("The Controller hereby provides general written authorization for the Processor to engage the sub-processors listed below. The Processor shall notify the Controller of any intended changes concerning the addition or replacement of other sub-processors.");
  addList([
    "Subprocessor: Google LLC (Firebase / Google Cloud Platform)",
    "Purpose of Subprocessing: Cloud hosting, database services, and authentication.",
    "Location: United States",
  ]);
  
  pdfState.y -= (LINE_GAP.body * 1.5); // Add space
  addH3("IN WITNESS WHEREOF,");
  addParagraph("this Agreement is entered into with effect from the date first set out below.");
  addSignatureBlocks(data, true); // true for DPA-style signatures
};


// ---
// NEW V7 CONTRACT GENERATION (MAIN FUNCTION)
// ---
exports.generateContractV2 = onCall(
  {
    memory: "512MiB", // Reduced memory
    timeoutSeconds: 60,
  },
  async (request) => {
    const { quoteId } = request.data;
    if (!quoteId) {
      throw new HttpsError("invalid-argument", "The function must be called with a 'quoteId'.");
    }

    logger.info(`--- V7 Contract Generation START for quoteId: ${quoteId} ---`);

    try {
      // 1. Get Quote & Config data
      logger.info("Step 1: Fetching documents...");
      const quoteRef = db.doc(`quotes/${quoteId}`);
      const configRef = db.doc("config/main");
      
      const [quoteDoc, configDoc] = await Promise.all([
        quoteRef.get(),
        configRef.get(),
      ]);

      if (!quoteDoc.exists) {
        throw new HttpsError("not-found", "Quote document not found.");
      }
      if (!configDoc.exists) {
        throw new HttpsError("not-found", "Main config document not found.");
      }
      
      const quoteData = quoteDoc.data();
      const configData = configDoc.data();
      const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      
      logger.info(`Quote Service Model: ${quoteData.serviceModel}`);

      // 2. Calculate Fees
      logger.info("Step 2: Calculating fees...");
      let fees = {};
      let rawTotalCost = 0;
      if (quoteData.serviceModel === "subscription") {
        const clientChoices = {
          tier: quoteData.selectedTier,
          paymentPlan: quoteData.selectedPaymentPlan,
          amortizationTerm: quoteData.selectedAmortizationTerm,
        };
        const subFees = calculateSubscription(quoteData, clientChoices, configData);
        fees = {
          tierName: subFees.tierName || "N/A",
          setupFee: formatCurrency(subFees.setupFee),
          amortizedMonthly: formatCurrency(subFees.amortizedMonthly),
          tierMonthly: formatCurrency(subFees.tierMonthly),
          totalActiveMonthly: formatCurrency(subFees.totalActiveMonthly),
          minTerm: subFees.minTerm,
        };
      } else if (quoteData.serviceModel === "project") {
        const projFees = calculateProject(quoteData, configData);
        rawTotalCost = projFees.totalCost;
        fees = {
          totalCost: formatCurrency(projFees.totalCost),
          rawTotalCost: rawTotalCost, // Pass raw number for 50/50 split
        };
      } else if (quoteData.serviceModel === "maintenance") {
        fees = {
          monthlyFee: formatCurrency(quoteData.finalMonthlyFee),
          includedHours: quoteData.includedHours,
        };
      } else if (quoteData.serviceModel === "hourly") {
        const hourlyRate = (configData.base_rates && configData.base_rates.hourly_rate) ? configData.base_rates.hourly_rate : 0;
        fees = {
          hourlyRate: formatCurrency(hourlyRate),
        };
      }
      logger.info("Step 2: Fees calculated successfully.");

      // 3. Build Placeholder Data Object
      logger.info("Step 3: Building placeholder data...");
      const placeholderData = {
        // Client Info
        clientLegalName: quoteData.clientLegalName || '____________________',
        clientLegalAddress: quoteData.clientLegalAddress || '____________________',
        clientEntityType: quoteData.clientEntityType || '____________________',
        
        // Company Info
        companyName: configData.company_info.name || 'Lanting Digital LLC',
        companyAddress: "4200 Main Street, Riverside, CA 92501", // Hardcoded from MSA
        companyContactName: configData.company_info.contact_name || 'Caleb Lanting',

        // Project Info
        today: today,
        projectTitle: quoteData.projectTitle || 'N/A',
        projectScope: quoteData.projectScope || '(No scope defined)',
        serviceModel: quoteData.serviceModel,
        
        // Fees
        fees: fees,
      };
      logger.info("Step 3: Placeholder data built.");

      // 4. --- Generate PDFs ---
      logger.info("Step 4: Starting PDF generation...");
      
      const generatedDocs = [];
      const bucket = storage.bucket(getStorage().bucket().name);
      const contractBundleId = Timestamp.now().toMillis();
      const safeClientName = (placeholderData.clientLegalName || 'Client').replace(/[^a-zA-Z0-9]/g, "_");

      // --- TEMPLATE LIST ---
      const templatesToBuild = ["SOW", "MSA", "DPA"];
      if (placeholderData.serviceModel === "subscription") {
        templatesToBuild.push("SLA");
      }
      
      for (const templateName of templatesToBuild) {
        logger.info(`Generating ${templateName}...`);
        
        // Create a new PDF document FOR EACH FILE
        const singleDoc = await PDFDocument.create();
        const singleDocFonts = {
          helvetica: await singleDoc.embedFont(StandardFonts.Helvetica),
          helveticaBold: await singleDoc.embedFont(StandardFonts.HelveticaBold),
          helveticaOblique: await singleDoc.embedFont(StandardFonts.HelveticaOblique),
          zapfDingbats: await singleDoc.embedFont(StandardFonts.ZapfDingbats), // For checkboxes
        };
        // Reset the global state for this new document
        pdfState = { doc: singleDoc, page: null, fonts: singleDocFonts, y: 0 };

        // Call the correct drawing function
        if (templateName === "SOW") {
          drawSOW(placeholderData);
        } else if (templateName === "MSA") {
          drawMSA(placeholderData);
        } else if (templateName === "SLA") {
          drawSLA(placeholderData);
        } else if (templateName === "DPA") {
          drawDPA(placeholderData);
        }

        // Save the bytes for this single doc
        const pdfBytes = await singleDoc.save();
        
        // --- Save to Storage ---
        const fileName = `${safeClientName}-${templateName}-${contractBundleId}.pdf`;
        const filePath = `contracts/${quoteId}/${fileName}`;
        const file = bucket.file(filePath);

        await file.save(Buffer.from(pdfBytes), {
          metadata: { contentType: "application/pdf" },
        });

        const [url] = await file.getSignedUrl({
          action: "read",
          expires: "03-09-2491", 
        });

        generatedDocs.push({
          name: templateName,
          url: url,
          generatedAt: Timestamp.now(),
          path: filePath,
        });
        logger.info(`Successfully generated and saved ${templateName}.`);
      }
      
      logger.info("Step 4: PDF generation loop complete.");

      // 5. Update the quote document
      logger.info("Step 5: Updating quote document in Firestore...");
      await quoteRef.update({
        status: "Contract Generated",
        contractDocs: generatedDocs,
        lastContractGenerated: Timestamp.now(),
      });

      logger.info(`--- V7 Contract Generation SUCCESS for quoteId: ${quoteId} ---`);
      return {
        status: "success",
        message: "Contracts generated successfully!",
        contractUrl: generatedDocs.find(d => d.name === "SOW")?.url || generatedDocs[0]?.url,
      };
    } catch (err) {
      logger.error("---!! Contract Generation FAILED !!---", {
        quoteId: quoteId,
        error: err,
        stack: err.stack,
        message: err.message,
      });
      throw new HttpsError("internal", `An error occurred: ${err.message}`);
    }
  }
);
