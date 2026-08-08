import PDFDocument from 'pdfkit';

import { displayName } from '../../domain/categories';
import { formatMoney, money } from '../../domain/money';
import type { ProfessionalMonthlyReport } from '../../modules/insights/insights.service';

const COLORS = {
  ink: '#17213A',
  muted: '#667085',
  line: '#E4E7EC',
  panel: '#F7F9FC',
  navy: '#132A4F',
  blue: '#3977E8',
  teal: '#0E9384',
  amber: '#EAAA08',
  red: '#D92D20',
  white: '#FFFFFF',
};

const PAGE_WIDTH = 612;
const CONTENT_LEFT = 48;
const CONTENT_WIDTH = 516;

export async function renderMonthlyReportPdf(
  bundle: ProfessionalMonthlyReport,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: 48, right: 48, bottom: 52, left: 48 },
    bufferPages: true,
    info: {
      Title: `FINVERSE Monthly Report - ${bundle.report.summary.period.start}`,
      Author: 'FINVERSE',
      Subject: 'Personal financial summary',
      Keywords: 'finance, budget, cash flow, subscriptions, financial health',
      CreationDate: new Date(`${bundle.asOf}T12:00:00.000Z`),
    },
  });

  const chunks: Buffer[] = [];
  const complete = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  renderOverview(doc, bundle);
  doc.addPage();
  renderSpendingAndBudgets(doc, bundle);
  doc.addPage();
  renderOutlookAndActions(doc, bundle);
  addFooters(doc, bundle.asOf);
  doc.end();

  return complete;
}

function renderOverview(doc: PDFKit.PDFDocument, bundle: ProfessionalMonthlyReport): void {
  const { summary, previous } = bundle.report;
  doc.rect(0, 0, PAGE_WIDTH, 132).fill(COLORS.navy);
  doc
    .fillColor(COLORS.white)
    .font('Helvetica-Bold')
    .fontSize(12)
    .text('FINVERSE', CONTENT_LEFT, 38, { characterSpacing: 2 });
  doc.fontSize(27).text('Monthly Financial Report', CONTENT_LEFT, 66);
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#D0D5DD')
    .text(`${summary.period.start} to ${summary.period.end}  |  Generated ${bundle.asOf}`, CONTENT_LEFT, 103);

  sectionTitle(doc, 'Your month at a glance', 158);
  const metrics = [
    ['Income', amount(summary.income, summary.currency), COLORS.teal],
    ['Expenses', amount(summary.expenses, summary.currency), COLORS.red],
    ['Net cash flow', amount(summary.netCashFlow, summary.currency), summary.netCashFlow >= 0 ? COLORS.teal : COLORS.red],
    ['Savings rate', `${summary.savingsRate.toFixed(1)}%`, COLORS.blue],
  ] as const;
  metrics.forEach((metric, index) => metricCard(doc, 48 + index * 132, 185, 120, metric[0], metric[1], metric[2]));

  sectionTitle(doc, 'Cash flow comparison', 286);
  comparisonChart(doc, summary.income, summary.expenses, previous.income, previous.expenses, summary.currency, 48, 313);

  sectionTitle(doc, 'Financial health', 484);
  const scoreColor = bundle.health.score >= 700 ? COLORS.teal : bundle.health.score >= 550 ? COLORS.amber : COLORS.red;
  doc.roundedRect(48, 511, 156, 112, 9).fill(COLORS.panel);
  doc.fillColor(scoreColor).font('Helvetica-Bold').fontSize(34).text(String(bundle.health.score), 62, 531, { width: 128, align: 'center' });
  doc.fillColor(COLORS.ink).fontSize(11).text(`/ 1000  ${ascii(bundle.health.band).toUpperCase()}`, 62, 574, { width: 128, align: 'center' });
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text('A guide based on connected data, not a credit score.', 60, 599, { width: 132, align: 'center' });

  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(11).text('Highest-impact next steps', 228, 514);
  const actions = bundle.health.topActions.slice(0, 3);
  if (actions.length === 0) {
    body(doc, 'No urgent score actions were identified from the available data.', 228, 540, 330);
  } else {
    actions.forEach((action, index) => numberedItem(doc, index + 1, action, 228, 540 + index * 34, 330));
  }
}

function renderSpendingAndBudgets(doc: PDFKit.PDFDocument, bundle: ProfessionalMonthlyReport): void {
  pageHeader(doc, 'Spending and budget control', 'Where money went and which limits need attention');
  sectionTitle(doc, 'Largest spending categories', 104);

  const categories = bundle.report.summary.topCategories.slice(0, 7);
  const maxCategory = Math.max(1, ...categories.map((category) => category.total));
  if (categories.length === 0) {
    emptyState(doc, 'No settled spending transactions were available for this period.', 48, 135);
  } else {
    categories.forEach((category, index) => {
      const y = 136 + index * 39;
      const label = ascii(category.categoryName);
      doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(9).text(label, 48, y, { width: 160, height: 12, ellipsis: true });
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text(`${category.transactionCount} transaction${category.transactionCount === 1 ? '' : 's'}`, 48, y + 14, { width: 160 });
      const barWidth = Math.max(3, (category.total / maxCategory) * 240);
      doc.roundedRect(218, y + 4, 240, 10, 5).fill('#EAECF0');
      doc.roundedRect(218, y + 4, barWidth, 10, 5).fill(COLORS.blue);
      doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(9).text(amount(category.total, bundle.report.summary.currency), 466, y + 3, { width: 98, height: 12, align: 'right', ellipsis: true });
    });
  }

  sectionTitle(doc, 'Budget performance', 430);
  const budgets = bundle.budgets.slice(0, 6);
  if (budgets.length === 0) {
    emptyState(doc, 'No budgets are configured yet. Add category limits to turn spending into a plan.', 48, 462);
  } else {
    budgets.forEach((budget, index) => {
      const y = 462 + index * 42;
      const used = Math.max(0, Math.min(1, budget.percentUsed / 100));
      const color = budget.status === 'exceeded' || budget.status === 'critical'
        ? COLORS.red
        : budget.status === 'warning'
          ? COLORS.amber
          : COLORS.teal;
      doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(9).text(ascii(displayName(budget.categorySlug)), 48, y, { width: 145 });
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text(`${amount(budget.spentAmount, budget.currency)} of ${amount(budget.limitAmount, budget.currency)}`, 48, y + 14, { width: 160 });
      doc.roundedRect(218, y + 4, 240, 10, 5).fill('#EAECF0');
      if (used > 0) doc.roundedRect(218, y + 4, Math.max(3, 240 * used), 10, 5).fill(color);
      doc.fillColor(color).font('Helvetica-Bold').fontSize(9).text(`${budget.percentUsed.toFixed(0)}%`, 470, y + 3, { width: 94, align: 'right' });
      if (budget.projectedToExceed) {
        doc.fillColor(COLORS.red).font('Helvetica').fontSize(7.5).text('Projected to exceed at current pace', 218, y + 19, { width: 300 });
      }
    });
  }
}

function renderOutlookAndActions(doc: PDFKit.PDFDocument, bundle: ProfessionalMonthlyReport): void {
  pageHeader(doc, 'Outlook and action plan', 'Upcoming cash flow, recurring costs, and evidence-based priorities');
  sectionTitle(doc, '30-day liquid cash forecast', 104);
  forecastChart(doc, bundle, 48, 134, 516, 150);

  const ending = bundle.forecast.points.at(-1)?.balance ?? bundle.forecast.startingBalance;
  body(
    doc,
    `Starts at ${amount(bundle.forecast.startingBalance, bundle.forecast.currency)} and projects to ${amount(ending, bundle.forecast.currency)}. ${bundle.forecast.lowBalanceDates.length === 0 ? 'No modeled negative-balance date was found.' : `${bundle.forecast.lowBalanceDates.length} modeled low-balance date(s) need attention.`}`,
    48,
    293,
    516,
  );

  sectionTitle(doc, 'Recurring subscriptions', 341);
  const subscriptions = bundle.subscriptions.subscriptions.slice(0, 5);
  if (subscriptions.length === 0) {
    emptyState(doc, 'No recurring subscriptions met the evidence threshold.', 48, 373);
  } else {
    subscriptions.forEach((subscription, index) => {
      const y = 374 + index * 27;
      doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(9).text(ascii(subscription.merchant), 48, y, { width: 215, height: 12, ellipsis: true });
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text(`${ascii(subscription.cadence)} | next ${subscription.nextExpected}`, 270, y, { width: 180, height: 12, ellipsis: true });
      doc.fillColor(subscription.priceIncrease ? COLORS.red : COLORS.ink).font('Helvetica-Bold').fontSize(9).text(amount(subscription.annualCost, subscription.currency), 452, y, { width: 112, align: 'right' });
    });
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text(`Estimated annual recurring cost: ${amount(bundle.subscriptions.annualTotal, bundle.report.summary.currency)}`, 48, 512);
  }

  sectionTitle(doc, 'Priorities and warnings', 548);
  const priorities = [
    ...bundle.report.insights.map((insight) => insight.detail),
    ...bundle.creditCards.flatMap((card) => card.alerts.map((alert) => `${card.accountName}: ${alert}`)),
  ].slice(0, 4);
  if (priorities.length === 0) {
    emptyState(doc, 'No material warning was identified from the available evidence.', 48, 580);
  } else {
    priorities.forEach((priority, index) => numberedItem(doc, index + 1, priority, 48, 579 + index * 31, 516));
  }

  doc.roundedRect(48, 704, 516, 31, 6).fill('#FFF7E6');
  doc.fillColor('#7A2E0E').font('Helvetica').fontSize(7.5).text(
    'Educational estimate only. Forecasts use detected recurring history and may omit future activity. This is not financial, tax, legal, or credit advice.',
    58,
    713,
    { width: 496, align: 'center' },
  );
}

function comparisonChart(
  doc: PDFKit.PDFDocument,
  income: number,
  expenses: number,
  previousIncome: number,
  previousExpenses: number,
  currency: string,
  x: number,
  y: number,
): void {
  const values = [income, expenses, previousIncome, previousExpenses];
  const maximum = Math.max(1, ...values);
  const chartHeight = 124;
  const baseY = y + chartHeight;
  const groups = [
    { label: 'Current period', values: [income, expenses] },
    { label: 'Previous comparable period', values: [previousIncome, previousExpenses] },
  ];
  doc.moveTo(x, baseY).lineTo(x + CONTENT_WIDTH, baseY).strokeColor(COLORS.line).stroke();
  groups.forEach((group, groupIndex) => {
    const groupX = x + 74 + groupIndex * 258;
    group.values.forEach((value, valueIndex) => {
      const height = Math.max(2, (value / maximum) * 102);
      const barX = groupX + valueIndex * 54;
      doc.roundedRect(barX, baseY - height, 38, height, 4).fill(valueIndex === 0 ? COLORS.teal : COLORS.red);
      doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(7.5).text(amount(value, currency), barX - 12, baseY - height - 14, { width: 62, align: 'center' });
    });
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text(group.label, groupX - 18, baseY + 8, { width: 130, align: 'center' });
  });
  doc.rect(x + 360, y - 5, 8, 8).fill(COLORS.teal);
  doc.fillColor(COLORS.muted).fontSize(8).text('Income', x + 373, y - 6);
  doc.rect(x + 428, y - 5, 8, 8).fill(COLORS.red);
  doc.text('Expenses', x + 441, y - 6);
}

function forecastChart(
  doc: PDFKit.PDFDocument,
  bundle: ProfessionalMonthlyReport,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const points = bundle.forecast.points;
  doc.roundedRect(x, y, width, height, 8).fill(COLORS.panel);
  if (points.length < 2) {
    body(doc, 'Not enough recurring history to draw a forecast.', x + 18, y + 60, width - 36);
    return;
  }
  const balances = points.map((point) => point.balance);
  const min = Math.min(0, ...balances);
  const max = Math.max(1, ...balances);
  const range = Math.max(1, max - min);
  const pad = 18;
  const plotWidth = width - pad * 2;
  const plotHeight = height - 42;
  const mapX = (index: number) => x + pad + (index / (points.length - 1)) * plotWidth;
  const mapY = (value: number) => y + 12 + ((max - value) / range) * plotHeight;
  const zeroY = mapY(0);
  if (zeroY >= y + 12 && zeroY <= y + 12 + plotHeight) {
    doc.moveTo(x + pad, zeroY).lineTo(x + width - pad, zeroY).dash(3, { space: 3 }).strokeColor('#FDA29B').stroke().undash();
  }
  doc.moveTo(mapX(0), mapY(points[0]!.balance));
  points.slice(1).forEach((point, index) => doc.lineTo(mapX(index + 1), mapY(point.balance)));
  doc.lineWidth(2).strokeColor(COLORS.blue).stroke();
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5).text(points[0]!.date, x + pad, y + height - 20);
  doc.text(points.at(-1)!.date, x + width - pad - 70, y + height - 20, { width: 70, align: 'right' });
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(8).text(amount(max, bundle.forecast.currency), x + 8, y + 8, { width: 100 });
}

function pageHeader(doc: PDFKit.PDFDocument, title: string, subtitle: string): void {
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(19).text(title, CONTENT_LEFT, 45);
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9).text(subtitle, CONTENT_LEFT, 73);
  doc.moveTo(CONTENT_LEFT, 91).lineTo(CONTENT_LEFT + CONTENT_WIDTH, 91).strokeColor(COLORS.line).stroke();
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string, y: number): void {
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(12).text(ascii(title), CONTENT_LEFT, y);
}

function metricCard(doc: PDFKit.PDFDocument, x: number, y: number, width: number, label: string, value: string, color: string): void {
  doc.roundedRect(x, y, width, 72, 8).fill(COLORS.panel);
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text(ascii(label).toUpperCase(), x + 11, y + 12, { width: width - 22 });
  doc.fillColor(color).font('Helvetica-Bold').fontSize(15).text(ascii(value), x + 11, y + 36, { width: width - 22, height: 19, ellipsis: true });
}

function numberedItem(doc: PDFKit.PDFDocument, number: number, text: string, x: number, y: number, width: number): void {
  doc.circle(x + 10, y + 9, 9).fill(COLORS.blue);
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(8).text(String(number), x + 5, y + 5, { width: 10, align: 'center' });
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8.5).text(ascii(text), x + 28, y + 1, {
    width: width - 28,
    height: 23,
    lineGap: 2,
    ellipsis: true,
  });
}

function body(doc: PDFKit.PDFDocument, text: string, x: number, y: number, width: number, size = 9): void {
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(size).text(ascii(text), x, y, { width, lineGap: 2 });
}

function emptyState(doc: PDFKit.PDFDocument, text: string, x: number, y: number): void {
  doc.roundedRect(x, y, CONTENT_WIDTH, 48, 7).fill(COLORS.panel);
  body(doc, text, x + 14, y + 17, CONTENT_WIDTH - 28);
}

function addFooters(doc: PDFKit.PDFDocument, asOf: string): void {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.moveTo(CONTENT_LEFT, 754).lineTo(CONTENT_LEFT + CONTENT_WIDTH, 754).strokeColor(COLORS.line).stroke();
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7).text('Private financial information - store securely', CONTENT_LEFT, 762, { width: 300, lineBreak: false });
    doc.text(`As of ${asOf}  |  Page ${index + 1} of ${range.count}`, 360, 762, { width: 204, align: 'right', lineBreak: false });
    doc.page.margins.bottom = bottomMargin;
  }
}

function amount(value: number, currency: string): string {
  return ascii(formatMoney(money(value, currency)));
}

function ascii(value: string): string {
  return value
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^\x20-\x7E]/g, '?');
}
