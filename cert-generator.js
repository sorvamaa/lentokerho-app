// Generates the graduation certificate PDF for a student.
// Layout: cover page -> theory summary -> flight summary -> attachment list -> merged attachments.

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { PDFDocument: PDFLibDocument } = require('pdf-lib');

const FONT_DIR = path.join(__dirname, 'node_modules', 'pdfkit', 'js', 'data');

function formatDate(value) {
  if (!value) return '—';
  let s;
  if (value instanceof Date) {
    s = value.toISOString().slice(0, 10);
  } else {
    s = String(value).slice(0, 10);
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  return `${parseInt(m[3], 10)}.${parseInt(m[2], 10)}.${m[1]}`;
}

function bufferFromPdfkit(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

function drawHeader(doc, club, logoBuffer) {
  const top = 50;
  if (logoBuffer) {
    try { doc.image(logoBuffer, 50, top, { fit: [50, 50] }); } catch (_) {}
  }
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#000')
     .text(club.name || '', 110, top + 5, { width: 400 });
  doc.font('Helvetica').fontSize(10).fillColor('#666')
     .text('Varjoliitokoulutus', 110, top + 24, { width: 400 });
  doc.moveTo(50, top + 60).lineTo(545, top + 60).strokeColor('#bbb').lineWidth(0.5).stroke();
  doc.fillColor('#000');
}

function drawCover(doc, student, club, stats, instructors, chief, theoryTotalMinutes, logoBuffer) {
  drawHeader(doc, club, logoBuffer);

  // Title
  doc.font('Helvetica-Bold').fontSize(28).fillColor('#000')
     .text('Kurssitodistus', 50, 160, { align: 'center', width: 495 });
  doc.font('Helvetica').fontSize(12).fillColor('#666')
     .text('Varjoliidon peruskoulutus PP2', 50, 195, { align: 'center', width: 495 });

  // Body
  doc.font('Helvetica').fontSize(13).fillColor('#666')
     .text('Tämä todistaa, että', 50, 250, { align: 'center', width: 495 });
  doc.font('Times-Roman').fontSize(28).fillColor('#000')
     .text(student.name || '', 50, 275, { align: 'center', width: 495 });
  doc.font('Helvetica').fontSize(12).fillColor('#666')
     .text(
       `on suorittanut hyväksytysti ${club.name || 'kerhon'} varjoliitokurssin PP2-tasolla koulutusohjelman mukaisesti.`,
       100, 320, { align: 'center', width: 395, lineGap: 3 }
     );

  // Summary table
  const tableTop = 390;
  const tableLeft = 130;
  const tableRight = 465;
  const rows = [
    ['Kurssi aloitettu', formatDate(student.course_started)],
    ['Kurssi suoritettu', formatDate(student.graduated_at)],
    ['Lentoja yhteensä', String(stats.total_flights || 0)],
    ['Teoriaopetuksen kokonaiskesto', formatTheoryDuration(theoryTotalMinutes)]
  ];
  doc.fontSize(11).fillColor('#000');
  rows.forEach((row, i) => {
    const y = tableTop + i * 24;
    doc.font('Helvetica').fillColor('#666').text(row[0], tableLeft, y);
    doc.font('Helvetica-Bold').fillColor('#000').text(row[1], tableLeft, y, {
      width: tableRight - tableLeft, align: 'right'
    });
    doc.moveTo(tableLeft, y + 18).lineTo(tableRight, y + 18)
       .dash(2, { space: 2 }).strokeColor('#ddd').lineWidth(0.5).stroke().undash();
  });

  // Signatures
  const sigTop = 600;
  const sigLeft = 70;
  const sigGap = 250;
  ['Päätoiminen ohjaaja', 'Koulutuspäällikkö'].forEach((role, idx) => {
    const x = sigLeft + idx * sigGap;
    doc.moveTo(x, sigTop).lineTo(x + 180, sigTop).strokeColor('#666').lineWidth(0.5).stroke();
    doc.font('Helvetica').fontSize(9).fillColor('#888').text(role, x, sigTop + 6, { width: 180 });
    const person = idx === 0
      ? (instructors[0] ? instructors[0].name : '')
      : (chief ? chief.name : '');
    doc.font('Helvetica').fontSize(11).fillColor('#000').text(person || '', x, sigTop + 20, { width: 180 });
  });

  // Place + date
  const place = club.name ? club.name.replace(/^.*?(Lentokerho|Ry|ry).*$/, '') : '';
  const placeText = `${club.contact_city || place || ''}, ${formatDate(student.graduated_at)}`.replace(/^, /, '');
  doc.font('Helvetica').fontSize(11).fillColor('#666')
     .text(placeText, 50, 680, { align: 'center', width: 495 });

  // Footer
  doc.font('Helvetica').fontSize(8).fillColor('#999')
     .text(`${club.name || ''} · pilottipolku.fi`, 50, 760, { width: 250 });
}

function formatTheoryDuration(minutes) {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function drawTheoryPage(doc, theoryBySection, club, logoBuffer) {
  doc.addPage();
  drawHeader(doc, club, logoBuffer);
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#000').text('Teoriasuoritukset', 50, 140);

  let y = 180;
  for (const level of ['pp1', 'pp2']) {
    const sections = theoryBySection[level] || [];
    if (sections.length === 0) continue;
    if (y > 700) { doc.addPage(); drawHeader(doc, club, logoBuffer); y = 140; }
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#000').text(level.toUpperCase(), 50, y);
    y += 22;
    for (const section of sections) {
      if (y > 720) { doc.addPage(); drawHeader(doc, club, logoBuffer); y = 140; }
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text(section.title, 50, y);
      y += 16;
      for (const topic of section.topics) {
        if (y > 760) { doc.addPage(); drawHeader(doc, club, logoBuffer); y = 140; }
        const dateStr = topic.completed_at ? formatDate(topic.completed_at) : '—';
        doc.font('Helvetica').fontSize(10).fillColor('#333').text(topic.title, 70, y, { width: 360 });
        doc.font('Helvetica').fontSize(10).fillColor('#666').text(dateStr, 430, y, { width: 115, align: 'right' });
        y += 14;
      }
      y += 8;
    }
    y += 10;
  }
}

function drawFlightsPage(doc, flights, club, logoBuffer) {
  doc.addPage();
  drawHeader(doc, club, logoBuffer);
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#000').text('Lennot', 50, 140);

  const cols = [
    { key: 'idx',   label: '#',           x: 50,  w: 25 },
    { key: 'date',  label: 'Päivä',       x: 80,  w: 70 },
    { key: 'site',  label: 'Paikka',      x: 155, w: 110 },
    { key: 'type',  label: 'Tyyppi',      x: 270, w: 55 },
    { key: 'count', label: 'Kpl',         x: 330, w: 25, align: 'right' },
    { key: 'notes', label: 'Muistiinpanot', x: 360, w: 185 }
  ];

  let y = 180;
  // Header row
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
  cols.forEach(c => doc.text(c.label, c.x, y, { width: c.w, align: c.align || 'left' }));
  y += 14;
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#888').lineWidth(0.5).stroke();
  y += 4;

  doc.font('Helvetica').fontSize(9).fillColor('#000');
  flights.forEach((f, i) => {
    if (y > 770) {
      doc.addPage();
      drawHeader(doc, club, logoBuffer);
      y = 140;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
      cols.forEach(c => doc.text(c.label, c.x, y, { width: c.w, align: c.align || 'left' }));
      y += 14;
      doc.moveTo(50, y).lineTo(545, y).strokeColor('#888').lineWidth(0.5).stroke();
      y += 4;
      doc.font('Helvetica').fontSize(9).fillColor('#000');
    }
    const typeLabel = f.flight_type === 'low' ? 'Matala' : 'Korkea';
    const approval = f.is_approval_flight ? ' (T)' : '';
    const values = {
      idx: String(i + 1),
      date: formatDate(f.date),
      site: f.site_name || '—',
      type: typeLabel + approval,
      count: String(f.flight_count || 1),
      notes: f.notes || ''
    };
    const notesHeight = doc.heightOfString(values.notes, { width: cols[5].w });
    const rowHeight = Math.max(14, notesHeight + 2);
    cols.forEach(c => doc.text(values[c.key], c.x, y, { width: c.w, align: c.align || 'left' }));
    y += rowHeight;
  });
}

function drawAttachmentsListPage(doc, attachments, club, logoBuffer) {
  if (attachments.length === 0) return;
  doc.addPage();
  drawHeader(doc, club, logoBuffer);
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#000').text('Liitteet', 50, 140);
  doc.font('Helvetica').fontSize(10).fillColor('#666')
     .text('Seuraavat liitteet sisältyvät tähän todistukseen tämän sivun jälkeisillä sivuilla.', 50, 170, { width: 495 });

  let y = 210;
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
  doc.text('#', 50, y, { width: 25 });
  doc.text('Tiedostonimi', 80, y, { width: 280 });
  doc.text('Tyyppi', 365, y, { width: 70 });
  doc.text('Lisätty', 440, y, { width: 105, align: 'right' });
  y += 14;
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#888').lineWidth(0.5).stroke();
  y += 6;

  doc.font('Helvetica').fontSize(10).fillColor('#000');
  attachments.forEach((a, i) => {
    if (y > 770) {
      doc.addPage();
      drawHeader(doc, club, logoBuffer);
      y = 140;
    }
    doc.text(String(i + 1), 50, y, { width: 25 });
    doc.text(a.filename || '', 80, y, { width: 280 });
    doc.text(shortType(a.mimetype), 365, y, { width: 70 });
    doc.text(formatDate(a.created_at), 440, y, { width: 105, align: 'right' });
    y += 16;
  });
}

function shortType(mime) {
  if (!mime) return '—';
  if (mime === 'application/pdf') return 'PDF';
  if (mime.startsWith('image/jpeg')) return 'JPG';
  if (mime.startsWith('image/png')) return 'PNG';
  return mime;
}

async function mergeAttachments(certBuffer, attachments, uploadDir) {
  if (attachments.length === 0) return certBuffer;
  const mainDoc = await PDFLibDocument.load(certBuffer);

  for (const att of attachments) {
    const filepath = path.join(uploadDir, att.stored_name);
    if (!fs.existsSync(filepath)) continue;
    const bytes = fs.readFileSync(filepath);
    try {
      if (att.mimetype === 'application/pdf') {
        const attDoc = await PDFLibDocument.load(bytes, { ignoreEncryption: true });
        const copied = await mainDoc.copyPages(attDoc, attDoc.getPageIndices());
        copied.forEach(p => mainDoc.addPage(p));
      } else if (att.mimetype === 'image/jpeg' || att.mimetype === 'image/png') {
        const image = att.mimetype === 'image/png'
          ? await mainDoc.embedPng(bytes)
          : await mainDoc.embedJpg(bytes);
        const page = mainDoc.addPage([595, 842]); // A4 portrait
        const margin = 36;
        const maxW = 595 - margin * 2;
        const maxH = 842 - margin * 2;
        const ratio = Math.min(maxW / image.width, maxH / image.height, 1);
        const w = image.width * ratio;
        const h = image.height * ratio;
        page.drawImage(image, {
          x: (595 - w) / 2,
          y: (842 - h) / 2,
          width: w,
          height: h
        });
      }
    } catch (e) {
      console.error(`Failed to merge attachment ${att.id}: ${e.message}`);
    }
  }

  return Buffer.from(await mainDoc.save());
}

/**
 * @param {object} args
 * @param {object} args.student - row from users
 * @param {object} args.club - row from clubs (with logo_path resolved if available)
 * @param {object} args.stats - getStudentStats() result
 * @param {Array}  args.flights - flights with site_name joined, sorted by date asc
 * @param {object} args.theoryBySection - { pp1: [{title, topics:[{title, completed_at}]}], pp2: [...] }
 * @param {number} args.theoryTotalMinutes - total minutes (across completed topics)
 * @param {Array}  args.instructors - users who have added flights or completions for this student (deduped)
 * @param {object|null} args.chief - chief instructor row of student's club
 * @param {Array}  args.attachments - attachments rows for student
 * @param {string} args.uploadDir - filesystem dir where attachments live
 * @param {Buffer|null} args.logoBuffer - club logo bytes (png/jpg) or null
 * @returns {Promise<Buffer>} PDF bytes
 */
async function generateCertificate(args) {
  const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true, bufferPages: true });
  drawCover(doc, args.student, args.club, args.stats, args.instructors || [], args.chief, args.theoryTotalMinutes || 0, args.logoBuffer);
  drawTheoryPage(doc, args.theoryBySection || { pp1: [], pp2: [] }, args.club, args.logoBuffer);
  drawFlightsPage(doc, args.flights || [], args.club, args.logoBuffer);
  drawAttachmentsListPage(doc, args.attachments || [], args.club, args.logoBuffer);
  // Page numbers
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.font('Helvetica').fontSize(8).fillColor('#999')
       .text(`Sivu ${i + 1} / ${range.count}`, 0, 790, { width: 545, align: 'right' });
  }
  const certBuffer = await bufferFromPdfkit(doc);
  return mergeAttachments(certBuffer, args.attachments || [], args.uploadDir);
}

module.exports = { generateCertificate, formatDate };
