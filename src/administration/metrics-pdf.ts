import PDFDocument from 'pdfkit';
import { AdministrationMetricsDto } from './dto/administration-response.dto';
import { AuditAction } from './entities/audit-log.entity';
import {
  ACTION_LABELS,
  ENTITY_LABELS,
  GROUP_LABELS,
  RANGE_LABELS,
} from './metrics-labels';

type Doc = PDFKit.PDFDocument;
type Distribution = AdministrationMetricsDto['distributions']['moods'];

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT = PAGE_WIDTH - MARGIN * 2;
const CONTENT_BOTTOM = PAGE_HEIGHT - 52;
const TIME_ZONE = 'America/Argentina/Cordoba';
const BAR_ROW = 26;

const REGULAR = 'Helvetica';
const BOLD = 'Helvetica-Bold';

// Brand tokens from SmartPlan-front/src/styles/tokens.css.
const EMBER = '#E85D20';
const CHAR = '#1A1109';
const CREAM = '#F5F0E8';
const CARD = '#FFFCF8';
const LINE = '#E8E0D4';
const TRACK = '#EFE8DD';
const FG2 = '#5C5448';
const FG3 = '#9E9589';
const ELECTRIC = '#2B5BFF';
const RATING = '#E0A800';
const WARNING_INK = '#7A4A00';
const SERIES = [
  EMBER,
  ELECTRIC,
  '#F5A623',
  '#22C06B',
  '#8B5CF6',
  '#14B8A6',
  '#E0457B',
  FG3,
];

// The standard PDF fonts only encode WinAnsi: Latin-1 plus these extras.
const WIN_ANSI_EXTRAS = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

const numberFormat = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 2,
});
const dateFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const dateTimeFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** Keeps user-provided text printable with the built-in PDF fonts. */
export function pdfText(value: string): string {
  return Array.from(value.normalize('NFC').replace(/\s+/g, ' '))
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return (
        (code >= 0x20 && code <= 0x7e) ||
        (code >= 0xa0 && code <= 0xff) ||
        WIN_ANSI_EXTRAS.includes(character)
      );
    })
    .join('')
    .trim();
}

function formatNumber(value: number): string {
  return numberFormat.format(value);
}

function percent(value: number): string {
  return `${formatNumber(value)}%`;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

/** Point on a circle; angle 0 is 12 o'clock and grows clockwise. */
function polar(cx: number, cy: number, radius: number, angle: number) {
  return {
    x: cx + radius * Math.sin(angle),
    y: cy - radius * Math.cos(angle),
  };
}

class MetricsReport {
  private y = 0;

  constructor(
    private readonly doc: Doc,
    private readonly metrics: AdministrationMetricsDto,
  ) {}

  private get rangeLabel(): string {
    return RANGE_LABELS[this.metrics.range.key] ?? this.metrics.range.key;
  }

  render(): void {
    this.header();
    this.highlights();
    this.kpis();
    this.performance();
    this.distributions();
    this.popularActivities();
    this.recentActivity();
    this.footers();
  }

  private text(
    value: string,
    x: number,
    y: number,
    options: {
      size: number;
      color: string;
      bold?: boolean;
      width?: number;
      align?: 'left' | 'center' | 'right';
      wrap?: boolean;
      spacing?: number;
    },
  ): void {
    this.doc
      .font(options.bold ? BOLD : REGULAR)
      .fontSize(options.size)
      .fillColor(options.color)
      .text(pdfText(value), x, y, {
        width: options.width,
        align: options.align ?? 'left',
        lineBreak: options.wrap ?? false,
        // A single line needs a height for pdfkit to truncate with an ellipsis.
        height: options.wrap ? undefined : options.size * 1.25,
        ellipsis: options.wrap ? undefined : true,
        characterSpacing: options.spacing ?? 0,
      });
  }

  private textHeight(
    value: string,
    options: { size: number; width: number; bold?: boolean },
  ): number {
    return this.doc
      .font(options.bold ? BOLD : REGULAR)
      .fontSize(options.size)
      .heightOfString(pdfText(value), { width: options.width });
  }

  private card(x: number, y: number, width: number, height: number): void {
    this.doc
      .lineWidth(0.8)
      .roundedRect(x, y, width, height, 8)
      .fillAndStroke(CARD, LINE);
  }

  /** Starts a new page when the next block would overlap the footer. */
  private ensureSpace(height: number): void {
    if (this.y + height <= CONTENT_BOTTOM) return;
    this.doc.addPage();
    this.doc.rect(0, 0, PAGE_WIDTH, 4).fill(EMBER);
    this.text(`Reporte de métricas · ${this.rangeLabel}`, MARGIN, MARGIN - 18, {
      size: 8,
      color: FG3,
      width: CONTENT,
    });
    this.y = MARGIN + 6;
  }

  /** Keeps a section title on the same page as the block that follows it. */
  private section(title: string, subtitle: string, blockHeight: number): void {
    this.ensureSpace(36 + blockHeight);
    this.doc.rect(MARGIN, this.y + 1, 3, 13).fill(EMBER);
    this.text(title, MARGIN + 10, this.y, {
      size: 12.5,
      color: CHAR,
      bold: true,
      width: CONTENT - 10,
    });
    this.text(subtitle, MARGIN + 10, this.y + 17, {
      size: 8.5,
      color: FG3,
      width: CONTENT - 10,
    });
    this.y += 36;
  }

  private header(): void {
    const { range } = this.metrics;
    this.doc.rect(0, 0, PAGE_WIDTH, 122).fill(CHAR);
    this.doc.rect(0, 122, PAGE_WIDTH, 4).fill(EMBER);

    this.doc.font(BOLD).fontSize(18);
    const brandWidth = this.doc.widthOfString('smartplan');
    this.text('smartplan', MARGIN, 32, {
      size: 18,
      color: '#FFFFFF',
      bold: true,
    });
    const pillX = MARGIN + brandWidth + 10;
    this.doc.roundedRect(pillX, 33, 54, 18, 9).fill(EMBER);
    this.text('ADMIN', pillX, 38.5, {
      size: 7.5,
      color: '#FFFFFF',
      bold: true,
      width: 54,
      align: 'center',
      spacing: 1,
    });

    this.text('Generado el', PAGE_WIDTH - MARGIN - 160, 32, {
      size: 8,
      color: '#B8AE9F',
      width: 160,
      align: 'right',
    });
    this.text(dateTimeFormat.format(range.to), PAGE_WIDTH - MARGIN - 160, 44, {
      size: 10,
      color: CREAM,
      bold: true,
      width: 160,
      align: 'right',
    });

    this.text('Reporte de métricas', MARGIN, 60, {
      size: 26,
      color: '#FFFFFF',
      bold: true,
      width: CONTENT,
    });
    this.text(
      `Período: ${this.rangeLabel}   ·   ${dateTimeFormat.format(range.from)} – ${dateTimeFormat.format(range.to)}`,
      MARGIN,
      94,
      { size: 10, color: '#CFC6B8', width: CONTENT },
    );
    this.y = 146;
  }

  private highlights(): void {
    const { metrics } = this;
    const lines: string[] = [];
    const topMood = [...metrics.distributions.moods].sort(
      (a, b) => b.count - a.count,
    )[0];
    const topGroup = [...metrics.distributions.groupSizes].sort(
      (a, b) => b.count - a.count,
    )[0];
    const topActivity = metrics.popularActivities[0];

    lines.push(
      `SmartPlan tiene ${formatNumber(metrics.kpis.totalUsers)} usuarios registrados, ${formatNumber(metrics.kpis.activePlans)} planes activos y ${formatNumber(metrics.kpis.catalogActivities)} actividades en el catálogo.`,
    );
    if (topMood && topMood.count > 0) {
      lines.push(
        `El tipo de salida más elegido fue "${topMood.name}" (${percent(topMood.percentage)} de los planes del período).`,
      );
    }
    if (topGroup && topGroup.count > 0) {
      lines.push(
        `El tamaño de grupo más frecuente fue "${GROUP_LABELS[topGroup.key] ?? topGroup.name}" (${percent(topGroup.percentage)}).`,
      );
    }
    if (topActivity) {
      lines.push(
        `La actividad más popular fue "${topActivity.name}", incluida en ${formatNumber(topActivity.planCount)} ${topActivity.planCount === 1 ? 'plan' : 'planes'}.`,
      );
    }
    lines.push(
      metrics.kpis.openReports > 0
        ? `Hay ${formatNumber(metrics.kpis.openReports)} ${metrics.kpis.openReports === 1 ? 'contenido denunciado' : 'contenidos denunciados'} esperando una decisión de moderación.`
        : 'No hay denuncias abiertas pendientes de moderación.',
    );

    const width = CONTENT - 32;
    this.doc.font(REGULAR).fontSize(9.5);
    const heights = lines.map(
      (line) => this.doc.heightOfString(pdfText(line), { width }) + 5,
    );
    const height = 34 + heights.reduce((sum, value) => sum + value, 0);

    this.doc.roundedRect(MARGIN, this.y, CONTENT, height, 8).fill(CREAM);
    this.text('LO MÁS DESTACADO', MARGIN + 16, this.y + 13, {
      size: 8,
      color: EMBER,
      bold: true,
      spacing: 1,
      width: CONTENT - 32,
    });
    let lineY = this.y + 29;
    lines.forEach((line, index) => {
      this.doc.circle(MARGIN + 19, lineY + 5, 2).fill(EMBER);
      this.text(line, MARGIN + 28, lineY, {
        size: 9.5,
        color: CHAR,
        width: width - 12,
        wrap: true,
      });
      lineY += heights[index];
    });
    this.y += height + 18;
  }

  private kpis(): void {
    this.section(
      'Estado general',
      'Totales acumulados de toda la plataforma; no dependen del período elegido.',
      74,
    );
    const { kpis } = this.metrics;
    const items = [
      { label: 'Total de usuarios', value: kpis.totalUsers, color: EMBER },
      { label: 'Planes activos', value: kpis.activePlans, color: ELECTRIC },
      {
        label: 'Actividades en catálogo',
        value: kpis.catalogActivities,
        color: '#22C06B',
      },
      {
        label: 'Denuncias abiertas',
        value: kpis.openReports,
        color: kpis.openReports > 0 ? '#F5A623' : FG3,
      },
    ];
    const gap = 10;
    const width = (CONTENT - gap * (items.length - 1)) / items.length;
    const height = 74;
    this.ensureSpace(height);
    items.forEach((item, index) => {
      const x = MARGIN + index * (width + gap);
      this.card(x, this.y, width, height);
      this.doc.rect(x + 12, this.y + 12, 18, 3).fill(item.color);
      this.text(formatNumber(item.value), x + 12, this.y + 22, {
        size: 22,
        color:
          item.label === 'Denuncias abiertas' && item.value > 0
            ? WARNING_INK
            : CHAR,
        bold: true,
        width: width - 24,
      });
      this.text(item.label, x + 12, this.y + 52, {
        size: 8.5,
        color: FG2,
        width: width - 24,
      });
    });
    this.y += height + 18;
  }

  private ring(
    cx: number,
    cy: number,
    radius: number,
    fraction: number,
    color: string,
  ): void {
    const doc = this.doc;
    doc.save();
    doc.lineWidth(7).strokeColor(TRACK).circle(cx, cy, radius).stroke();
    const value = clamp(fraction);
    if (value >= 0.9999) {
      doc.strokeColor(color).circle(cx, cy, radius).stroke();
    } else if (value > 0) {
      const start = polar(cx, cy, radius, 0);
      const end = polar(cx, cy, radius, value * Math.PI * 2);
      doc
        .lineCap('round')
        .path(
          `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${value > 0.5 ? 1 : 0} 1 ${end.x} ${end.y}`,
        )
        .strokeColor(color)
        .stroke();
    }
    doc.restore();
  }

  private performance(): void {
    const height = 104;
    this.section(
      `Rendimiento del período (${this.rangeLabel})`,
      'Calculado sobre la actividad registrada entre las fechas del reporte.',
      height,
    );
    const { metrics } = this;
    const items = [
      {
        title: 'Tasa de aceptación',
        center: percent(metrics.acceptanceRate),
        fraction: metrics.acceptanceRate / 100,
        color: EMBER,
        description:
          'Reseñas publicadas sobre el total de reseñas ya moderadas (publicadas o retiradas).',
      },
      {
        title: 'Valoración promedio',
        center: `${formatNumber(metrics.averageRating)}/5`,
        fraction: metrics.averageRating / 5,
        color: RATING,
        description:
          'Promedio de las valoraciones públicas, sobre 5 estrellas.',
      },
      {
        title: 'Retención',
        center: percent(metrics.retentionRate),
        fraction: metrics.retentionRate / 100,
        color: ELECTRIC,
        description:
          'Usuarios con al menos dos planes sobre el total de usuarios.',
      },
    ];
    const gap = 10;
    const width = (CONTENT - gap * (items.length - 1)) / items.length;
    items.forEach((item, index) => {
      const x = MARGIN + index * (width + gap);
      this.card(x, this.y, width, height);
      const cx = x + 38;
      const cy = this.y + height / 2;
      this.ring(cx, cy, 25, item.fraction, item.color);
      this.text(item.center, cx - 25, cy - 4.5, {
        size: 9,
        color: CHAR,
        bold: true,
        width: 50,
        align: 'center',
      });
      const textX = x + 74;
      const textWidth = width - 84;
      const titleHeight = this.textHeight(item.title, {
        size: 9.5,
        width: textWidth,
        bold: true,
      });
      const descriptionHeight = this.textHeight(item.description, {
        size: 7.5,
        width: textWidth,
      });
      const top = cy - (titleHeight + 4 + descriptionHeight) / 2;
      this.text(item.title, textX, top, {
        size: 9.5,
        color: CHAR,
        bold: true,
        width: textWidth,
        wrap: true,
      });
      this.text(item.description, textX, top + titleHeight + 4, {
        size: 7.5,
        color: FG2,
        width: textWidth,
        wrap: true,
      });
    });
    this.y += height + 18;
  }

  private barRows(
    entries: Distribution,
    x: number,
    y: number,
    width: number,
    labelFor: (entry: Distribution[number]) => string,
  ): void {
    const valueWidth = 80;
    entries.forEach((entry, index) => {
      const rowY = y + index * BAR_ROW;
      const color = SERIES[index % SERIES.length];
      this.text(labelFor(entry), x, rowY, {
        size: 9,
        color: CHAR,
        width: width - valueWidth - 8,
      });
      this.text(
        `${formatNumber(entry.count)} · ${percent(entry.percentage)}`,
        x + width - valueWidth,
        rowY + 0.5,
        { size: 8.5, color: FG2, width: valueWidth, align: 'right' },
      );
      this.doc.roundedRect(x, rowY + 13, width, 7, 3.5).fill(TRACK);
      const filled = width * clamp(entry.percentage / 100);
      if (filled > 0) {
        this.doc
          .roundedRect(x, rowY + 13, Math.max(filled, 7), 7, 3.5)
          .fill(color);
      }
    });
  }

  private donut(entries: Distribution, cx: number, cy: number): void {
    const outer = 44;
    const inner = 27;
    const total = entries.reduce((sum, entry) => sum + entry.count, 0);
    if (total === 0) {
      this.doc
        .lineWidth(outer - inner)
        .strokeColor(TRACK)
        .circle(cx, cy, (outer + inner) / 2)
        .stroke();
    } else {
      let angle = 0;
      entries.forEach((entry, index) => {
        if (entry.count === 0) return;
        const sweep = (entry.count / total) * Math.PI * 2;
        const color = SERIES[index % SERIES.length];
        if (sweep >= Math.PI * 2 - 1e-6) {
          this.doc
            .lineWidth(outer - inner)
            .strokeColor(color)
            .circle(cx, cy, (outer + inner) / 2)
            .stroke();
        } else {
          const large = sweep > Math.PI ? 1 : 0;
          const a = polar(cx, cy, outer, angle);
          const b = polar(cx, cy, outer, angle + sweep);
          const c = polar(cx, cy, inner, angle + sweep);
          const d = polar(cx, cy, inner, angle);
          this.doc
            .lineWidth(1.2)
            .path(
              `M ${a.x} ${a.y} A ${outer} ${outer} 0 ${large} 1 ${b.x} ${b.y} L ${c.x} ${c.y} A ${inner} ${inner} 0 ${large} 0 ${d.x} ${d.y} Z`,
            )
            .fillAndStroke(color, CARD);
        }
        angle += sweep;
      });
    }
    this.text(formatNumber(total), cx - inner, cy - 9, {
      size: 13,
      color: CHAR,
      bold: true,
      width: inner * 2,
      align: 'center',
    });
    this.text('planes', cx - inner, cy + 5, {
      size: 7,
      color: FG3,
      width: inner * 2,
      align: 'center',
    });
  }

  private distributions(): void {
    const { moods, groupSizes } = this.metrics.distributions;
    const gap = 12;
    const width = (CONTENT - gap) / 2;
    const moodsHeight = 46 + Math.max(moods.length, 1) * BAR_ROW;
    const groupsHeight = 40 + Math.max(108, groupSizes.length * 22);
    const height = Math.max(moodsHeight, groupsHeight);
    this.section(
      'Preferencias del período',
      'Cómo se reparten los planes según el tipo de salida y el tamaño del grupo.',
      height,
    );

    const leftX = MARGIN;
    this.card(leftX, this.y, width, height);
    this.text('Tipos de salida', leftX + 14, this.y + 14, {
      size: 10,
      color: CHAR,
      bold: true,
      width: width - 28,
    });
    if (moods.length === 0) {
      this.text('Sin planes en el período.', leftX + 14, this.y + 40, {
        size: 9,
        color: FG3,
        width: width - 28,
      });
    } else {
      this.barRows(
        moods,
        leftX + 14,
        this.y + 40,
        width - 28,
        (entry) => entry.name,
      );
    }

    const rightX = MARGIN + width + gap;
    this.card(rightX, this.y, width, height);
    this.text('Tamaño de grupo', rightX + 14, this.y + 14, {
      size: 10,
      color: CHAR,
      bold: true,
      width: width - 28,
    });
    const chartTop = this.y + 36;
    this.donut(groupSizes, rightX + 62, chartTop + 58);
    const legendX = rightX + 124;
    const legendWidth = width - 138;
    if (groupSizes.length === 0) {
      this.text('Sin planes en el período.', legendX, chartTop + 52, {
        size: 9,
        color: FG3,
        width: legendWidth,
      });
    }
    groupSizes.forEach((entry, index) => {
      const rowY = chartTop + 58 - (groupSizes.length * 22) / 2 + index * 22;
      this.doc
        .roundedRect(legendX, rowY + 1, 9, 9, 2)
        .fill(SERIES[index % SERIES.length]);
      this.text(GROUP_LABELS[entry.key] ?? entry.name, legendX + 15, rowY, {
        size: 9,
        color: CHAR,
        width: legendWidth - 15,
      });
      this.text(
        `${formatNumber(entry.count)} planes · ${percent(entry.percentage)}`,
        legendX + 15,
        rowY + 11,
        { size: 7.5, color: FG2, width: legendWidth - 15 },
      );
    });
    this.y += height + 18;
  }

  private popularActivities(): void {
    const activities = this.metrics.popularActivities;
    const rowHeight = 28;
    const height = 20 + Math.max(activities.length, 1) * rowHeight;
    this.section(
      'Actividades más populares',
      'Actividades incluidas en la mayor cantidad de planes distintos del período.',
      height,
    );
    this.card(MARGIN, this.y, CONTENT, height);
    if (activities.length === 0) {
      this.text(
        'Todavía no hay actividades en planes de este período.',
        MARGIN + 16,
        this.y + 18,
        {
          size: 9,
          color: FG3,
          width: CONTENT - 32,
        },
      );
      this.y += height + 18;
      return;
    }
    const max = Math.max(
      ...activities.map((activity) => activity.planCount),
      1,
    );
    const nameWidth = 190;
    const barX = MARGIN + 52 + nameWidth;
    const barWidth = CONTENT - (barX - MARGIN) - 86;
    activities.forEach((activity, index) => {
      const rowY = this.y + 14 + index * rowHeight;
      const leader = index === 0;
      this.doc.circle(MARGIN + 28, rowY + 7, 10).fill(leader ? EMBER : TRACK);
      this.text(String(index + 1), MARGIN + 18, rowY + 2.5, {
        size: 9,
        color: leader ? '#FFFFFF' : FG2,
        bold: true,
        width: 20,
        align: 'center',
      });
      this.text(activity.name, MARGIN + 46, rowY + 2, {
        size: 9.5,
        color: CHAR,
        bold: leader,
        width: nameWidth,
      });
      this.doc.roundedRect(barX, rowY + 3, barWidth, 9, 4.5).fill(TRACK);
      this.doc
        .roundedRect(
          barX,
          rowY + 3,
          Math.max(barWidth * (activity.planCount / max), 9),
          9,
          4.5,
        )
        .fill(leader ? EMBER : '#F2A27E');
      this.text(
        `${formatNumber(activity.planCount)} ${activity.planCount === 1 ? 'plan' : 'planes'}`,
        barX + barWidth + 10,
        rowY + 2,
        { size: 9, color: FG2, width: 66, align: 'right' },
      );
    });
    this.y += height + 18;
  }

  private recentActivity(): void {
    const entries = this.metrics.recentActivity;
    const rowHeight = 22;
    // Title, header and at least three rows stay together.
    this.section(
      'Actividad reciente',
      'Últimos movimientos registrados en la auditoría de la plataforma.',
      rowHeight * 4,
    );
    const columns = [
      { title: 'Fecha y hora', width: 112 },
      { title: 'Descripción', width: CONTENT - 112 - 170 },
      { title: 'Acción', width: 170 },
    ];
    const drawHeader = () => {
      this.doc.roundedRect(MARGIN, this.y, CONTENT, rowHeight, 6).fill(CHAR);
      let x = MARGIN;
      columns.forEach((column) => {
        this.text(column.title.toUpperCase(), x + 12, this.y + 7.5, {
          size: 7.5,
          color: CREAM,
          bold: true,
          width: column.width - 24,
          spacing: 0.6,
        });
        x += column.width;
      });
      this.y += rowHeight;
    };

    drawHeader();
    if (entries.length === 0) {
      this.text('No hay movimientos registrados.', MARGIN + 12, this.y + 7, {
        size: 9,
        color: FG3,
        width: CONTENT - 24,
      });
      this.y += rowHeight + 16;
      return;
    }
    entries.forEach((entry, index) => {
      if (this.y + rowHeight > CONTENT_BOTTOM) {
        this.ensureSpace(rowHeight * 2);
        drawHeader();
      }
      if (index % 2 === 1) {
        this.doc.rect(MARGIN, this.y, CONTENT, rowHeight).fill(CREAM);
      }
      const entity = ENTITY_LABELS[entry.affectedEntity] ?? 'Registro';
      const cells = [
        dateTimeFormat.format(entry.createdAt),
        entry.label || `${entity} #${entry.affectedEntityId}`,
        ACTION_LABELS[entry.action as AuditAction] ?? 'Acción registrada',
      ];
      let x = MARGIN;
      cells.forEach((value, column) => {
        this.text(value, x + 12, this.y + 7, {
          size: 8.5,
          color: column === 0 ? FG2 : CHAR,
          width: columns[column].width - 24,
        });
        x += columns[column].width;
      });
      this.y += rowHeight;
    });
    this.doc
      .lineWidth(0.8)
      .moveTo(MARGIN, this.y)
      .lineTo(MARGIN + CONTENT, this.y)
      .strokeColor(LINE)
      .stroke();
    this.y += 16;
  }

  private footers(): void {
    const range = this.doc.bufferedPageRange();
    for (let index = 0; index < range.count; index++) {
      this.doc.switchToPage(range.start + index);
      // Writing inside the bottom margin would otherwise open a new page.
      this.doc.page.margins.bottom = 0;
      const y = PAGE_HEIGHT - 36;
      this.doc
        .lineWidth(0.6)
        .moveTo(MARGIN, y - 8)
        .lineTo(PAGE_WIDTH - MARGIN, y - 8)
        .strokeColor(LINE)
        .stroke();
      this.text(
        `SmartPlan · Reporte de métricas · ${dateFormat.format(this.metrics.range.to)}`,
        MARGIN,
        y,
        { size: 7.5, color: FG3, width: CONTENT / 2 },
      );
      this.text(
        `Página ${index + 1} de ${range.count}`,
        MARGIN + CONTENT / 2,
        y,
        { size: 7.5, color: FG3, width: CONTENT / 2, align: 'right' },
      );
    }
  }
}

/** Renders the same snapshot used by REP-01 as a branded A4 PDF (CU58). */
export function metricsPdf(metrics: AdministrationMetricsDto): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    bufferPages: true,
    info: {
      Title: `Reporte de métricas - ${RANGE_LABELS[metrics.range.key] ?? metrics.range.key}`,
      Author: 'SmartPlan',
      Subject: 'Panel de control de administración (REP-01)',
      CreationDate: metrics.range.to,
    },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  new MetricsReport(doc, metrics).render();
  doc.end();
  return done;
}
