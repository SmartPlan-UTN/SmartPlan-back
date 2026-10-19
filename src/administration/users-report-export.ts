import PDFDocument from 'pdfkit';
import { AdminUsersReport } from './dto/admin-users-report.dto';

/**
 * CSV and PDF renderings of the users report (REP-02). Both read the same
 * snapshot, so the two formats never disagree on a number.
 */

export const USERS_RANGE_LABELS: Record<string, string> = {
  today: 'Hoy',
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
  month: 'Este mes',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  suspended: 'Suspendido',
};

const ROLE_LABELS: Record<string, string> = {
  user: 'Usuario',
  admin: 'Administrador',
};

const TIME_ZONE = 'America/Argentina/Cordoba';
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

export function statusLabel(key: string, name: string): string {
  return STATUS_LABELS[key] ?? name;
}

export function roleLabel(key: string, name: string): string {
  return ROLE_LABELS[key] ?? name;
}

function rangeLabel(report: AdminUsersReport): string {
  return (
    USERS_RANGE_LABELS[report.metrics.range.key] ?? report.metrics.range.key
  );
}

function filtersLabel(report: AdminUsersReport): string | null {
  const parts: string[] = [];
  if (report.filters.search) parts.push(`búsqueda "${report.filters.search}"`);
  if (report.filters.status) {
    parts.push(
      `estado ${statusLabel(report.filters.status, report.filters.status)}`,
    );
  }
  return parts.length ? parts.join(', ') : null;
}

// ── CSV ─────────────────────────────────────────────────────────────

/** Quotes a cell and neutralizes spreadsheet formulas in user-provided text. */
function cell(value: string | number): string {
  if (typeof value === 'number') return String(value);
  const trimmed = value.trimStart();
  const formula = ['=', '+', '-', '@', '\t', '\r'].some((prefix) =>
    trimmed.startsWith(prefix),
  );
  const text = formula ? `'${value}` : value;
  return `"${text.replaceAll('"', '""')}"`;
}

export function usersReportCsv(report: AdminUsersReport): Buffer {
  const { metrics } = report;
  const rows: Array<Array<string | number>> = [
    ['Reporte de usuarios'],
    ['Fecha de generación', metrics.range.to.toISOString()],
    ['Período', rangeLabel(report)],
    ['Desde', metrics.range.from.toISOString()],
    ['Hasta', metrics.range.to.toISOString()],
    ['Filtros del listado', filtersLabel(report) ?? 'Sin filtros'],
    [],
    ['Métricas'],
    ['Métrica', 'Valor'],
    ['Total de usuarios', metrics.totalUsers],
    ['Usuarios activos', metrics.activeUsers],
    ['Usuarios suspendidos', metrics.suspendedUsers],
    ['Administradores', metrics.administrators],
    ['Nuevos registros en el período', metrics.newUsers],
    [],
    ['Usuarios por rol'],
    ['Rol', 'Cantidad'],
    ...metrics.byRole.map((entry) => [
      roleLabel(entry.key, entry.name),
      entry.count,
    ]),
    [],
    [`Usuarios (${report.users.length} de ${report.totalMatching})`],
    [
      'Nombre',
      'Apellido',
      'Correo electrónico',
      'Rol',
      'Estado',
      'Fecha de registro',
    ],
    ...report.users.map((user) => [
      user.name,
      user.lastName,
      user.email,
      user.role,
      user.status,
      user.createdAt.toISOString(),
    ]),
  ];
  return Buffer.from(
    `\uFEFF${rows.map((row) => row.map(cell).join(';')).join('\r\n')}\r\n`,
    'utf8',
  );
}

// ── PDF ─────────────────────────────────────────────────────────────

type Doc = PDFKit.PDFDocument;

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT = PAGE_WIDTH - MARGIN * 2;
const CONTENT_BOTTOM = PAGE_HEIGHT - 52;
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
const SUCCESS = '#22C06B';
const WARNING = '#F5A623';

// The standard PDF fonts only encode WinAnsi: Latin-1 plus these extras.
const WIN_ANSI_EXTRAS =
  '\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178';

/** Keeps user-provided text printable with the built-in PDF fonts. */
function printable(value: string): string {
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

class UsersReportPdf {
  private y = 0;

  constructor(
    private readonly doc: Doc,
    private readonly report: AdminUsersReport,
  ) {}

  render(): void {
    this.header();
    this.kpis();
    this.breakdowns();
    this.usersTable();
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
      spacing?: number;
    },
  ): void {
    this.doc
      .font(options.bold ? BOLD : REGULAR)
      .fontSize(options.size)
      .fillColor(options.color)
      .text(printable(value), x, y, {
        width: options.width,
        align: options.align ?? 'left',
        lineBreak: false,
        // A single line needs a height for pdfkit to truncate with an ellipsis.
        height: options.size * 1.25,
        ellipsis: true,
        characterSpacing: options.spacing ?? 0,
      });
  }

  private card(x: number, y: number, width: number, height: number): void {
    this.doc
      .lineWidth(0.8)
      .roundedRect(x, y, width, height, 8)
      .fillAndStroke(CARD, LINE);
  }

  private ensureSpace(height: number): boolean {
    if (this.y + height <= CONTENT_BOTTOM) return false;
    this.doc.addPage();
    this.doc.rect(0, 0, PAGE_WIDTH, 4).fill(EMBER);
    this.text(
      `Reporte de usuarios · ${rangeLabel(this.report)}`,
      MARGIN,
      MARGIN - 18,
      {
        size: 8,
        color: FG3,
        width: CONTENT,
      },
    );
    this.y = MARGIN + 6;
    return true;
  }

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
    const { range } = this.report.metrics;
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

    this.text('Reporte de usuarios', MARGIN, 60, {
      size: 26,
      color: '#FFFFFF',
      bold: true,
      width: CONTENT,
    });
    this.text(
      `Período: ${rangeLabel(this.report)}   ·   ${dateTimeFormat.format(range.from)} – ${dateTimeFormat.format(range.to)}`,
      MARGIN,
      94,
      { size: 10, color: '#CFC6B8', width: CONTENT },
    );
    this.y = 146;
  }

  private kpis(): void {
    const { metrics } = this.report;
    this.section(
      'Resumen de cuentas',
      'Totales actuales de la plataforma; los nuevos registros dependen del período elegido.',
      74,
    );
    const items = [
      { label: 'Total de usuarios', value: metrics.totalUsers, color: EMBER },
      { label: 'Activos', value: metrics.activeUsers, color: SUCCESS },
      { label: 'Suspendidos', value: metrics.suspendedUsers, color: WARNING },
      { label: 'Administradores', value: metrics.administrators, color: CHAR },
      {
        label: 'Nuevos en el período',
        value: metrics.newUsers,
        color: ELECTRIC,
      },
    ];
    const gap = 8;
    const width = (CONTENT - gap * (items.length - 1)) / items.length;
    const height = 74;
    items.forEach((item, index) => {
      const x = MARGIN + index * (width + gap);
      this.card(x, this.y, width, height);
      this.doc.rect(x + 12, this.y + 12, 18, 3).fill(item.color);
      this.text(String(item.value), x + 12, this.y + 22, {
        size: 22,
        color: CHAR,
        bold: true,
        width: width - 24,
      });
      this.text(item.label, x + 12, this.y + 52, {
        size: 8,
        color: FG2,
        width: width - 20,
      });
    });
    this.y += height + 18;
  }

  private bars(
    title: string,
    entries: Array<{ label: string; count: number }>,
    x: number,
    width: number,
    height: number,
    colors: string[],
  ): void {
    this.card(x, this.y, width, height);
    this.text(title, x + 14, this.y + 14, {
      size: 10,
      color: CHAR,
      bold: true,
      width: width - 28,
    });
    const total = entries.reduce((sum, entry) => sum + entry.count, 0);
    entries.forEach((entry, index) => {
      const rowY = this.y + 40 + index * 26;
      const share = total ? entry.count / total : 0;
      this.text(entry.label, x + 14, rowY, {
        size: 9,
        color: CHAR,
        width: width - 110,
      });
      this.text(
        `${entry.count} · ${Math.round(share * 100)}%`,
        x + width - 94,
        rowY + 0.5,
        { size: 8.5, color: FG2, width: 80, align: 'right' },
      );
      this.doc.roundedRect(x + 14, rowY + 13, width - 28, 7, 3.5).fill(TRACK);
      if (share > 0) {
        this.doc
          .roundedRect(
            x + 14,
            rowY + 13,
            Math.max((width - 28) * share, 7),
            7,
            3.5,
          )
          .fill(colors[index % colors.length]);
      }
    });
  }

  private breakdowns(): void {
    const { byStatus, byRole } = this.report.metrics;
    const rows = Math.max(byStatus.length, byRole.length, 1);
    const height = 46 + rows * 26;
    this.section(
      'Distribución',
      'Cómo se reparten las cuentas según su estado y su rol.',
      height,
    );
    const gap = 12;
    const width = (CONTENT - gap) / 2;
    this.bars(
      'Por estado',
      byStatus.map((entry) => ({
        label: statusLabel(entry.key, entry.name),
        count: entry.count,
      })),
      MARGIN,
      width,
      height,
      [SUCCESS, WARNING, FG3],
    );
    this.bars(
      'Por rol',
      byRole.map((entry) => ({
        label: roleLabel(entry.key, entry.name),
        count: entry.count,
      })),
      MARGIN + width + gap,
      width,
      height,
      [EMBER, CHAR, ELECTRIC],
    );
    this.y += height + 18;
  }

  private usersTable(): void {
    const { users, totalMatching } = this.report;
    const rowHeight = 22;
    const shown =
      users.length < totalMatching
        ? ` Se muestran los ${users.length} más recientes de ${totalMatching}.`
        : '';
    const filters = filtersLabel(this.report);
    const listing = filters
      ? `Listado filtrado por ${filters}`
      : 'Listado completo';
    this.section(
      `Usuarios (${totalMatching})`,
      `${listing}, del registro más reciente al más antiguo.${shown}`,
      rowHeight * 4,
    );
    const columns = [
      { title: 'Usuario', width: 140 },
      { title: 'Correo electrónico', width: CONTENT - 140 - 84 - 72 - 72 },
      { title: 'Rol', width: 84 },
      { title: 'Estado', width: 72 },
      { title: 'Registro', width: 72 },
    ];
    const drawHeader = () => {
      this.doc.roundedRect(MARGIN, this.y, CONTENT, rowHeight, 6).fill(CHAR);
      let x = MARGIN;
      columns.forEach((column) => {
        this.text(column.title.toUpperCase(), x + 10, this.y + 7.5, {
          size: 7.5,
          color: CREAM,
          bold: true,
          width: column.width - 20,
          spacing: 0.6,
        });
        x += column.width;
      });
      this.y += rowHeight;
    };

    drawHeader();
    if (users.length === 0) {
      this.text(
        'No hay usuarios que coincidan con los filtros.',
        MARGIN + 10,
        this.y + 7,
        {
          size: 9,
          color: FG3,
          width: CONTENT - 20,
        },
      );
      this.y += rowHeight + 16;
      return;
    }
    users.forEach((user, index) => {
      if (this.ensureSpace(rowHeight)) drawHeader();
      if (index % 2 === 1) {
        this.doc.rect(MARGIN, this.y, CONTENT, rowHeight).fill(CREAM);
      }
      const cells = [
        `${user.name} ${user.lastName}`,
        user.email,
        user.role,
        user.status,
        dateFormat.format(user.createdAt),
      ];
      let x = MARGIN;
      cells.forEach((value, column) => {
        this.text(value, x + 10, this.y + 7, {
          size: 8.5,
          color: column === 0 ? CHAR : FG2,
          bold: column === 0,
          width: columns[column].width - 20,
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
        `SmartPlan · Reporte de usuarios · ${dateFormat.format(this.report.metrics.range.to)}`,
        MARGIN,
        y,
        { size: 7.5, color: FG3, width: CONTENT / 2 },
      );
      this.text(
        `Página ${index + 1} de ${range.count}`,
        MARGIN + CONTENT / 2,
        y,
        {
          size: 7.5,
          color: FG3,
          width: CONTENT / 2,
          align: 'right',
        },
      );
    }
  }
}

export function usersReportPdf(report: AdminUsersReport): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    bufferPages: true,
    info: {
      Title: `Reporte de usuarios - ${rangeLabel(report)}`,
      Author: 'SmartPlan',
      Subject: 'Administración de usuarios (REP-02)',
      CreationDate: report.metrics.range.to,
    },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  new UsersReportPdf(doc, report).render();
  doc.end();
  return done;
}
