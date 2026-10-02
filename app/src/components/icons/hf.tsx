import type { SVGProps } from 'react'

/**
 * Свои иконки Hlow Flow (дизайн: icons/custom/*.svg). Рисованы в сетке lucide —
 * 24 px, штрих 2, currentColor, — поэтому ставятся тем же способом: размер и цвет
 * задаёт className (h-4 w-4 text-…). «Чековая» рваная кромка — общий мотив:
 * у удаления, копирования, оплаты и досрочного платежа.
 */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

/** Камера с чеком: загрузка чека. */
export function CameraReceiptIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M8 8V3l1.33 1 1.34-1 1.33 1 1.33-1 1.34 1L16 3v5" />
      <path d="M3 10a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="14" r="3" />
    </Icon>
  )
}

/** Два чека: копировать. */
export function CopyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 8h11v13l-1.83-1.3-1.84 1.3-1.83-1.3-1.83 1.3-1.84-1.3L4 21z" />
      <path d="M9 5V3h11v13l-1.5-1.1" />
      <path d="M7 12.5h5M7 16h3" />
    </Icon>
  )
}

/** Корзина с рваной кромкой: удалить. */
export function DeleteIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 7l2.25-1 2.25 1 2.25-1 2.25 1 2.25-1 2.25 1 2.25-1L21 7" />
      <path d="M9 6V3.5h6V6" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </Icon>
  )
}

/** Карандаш: редактировать. */
export function EditIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />
      <path d="M14.5 7.5l2 2" />
      <path d="M13 20h2.5M18.5 20h1.5" />
    </Icon>
  )
}

/** Чек с плюсом: досрочный платёж сверх минимума. */
export function PayExtraIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M9 3h11v18l-1.83-1.5-1.84 1.5-1.83-1.5-1.83 1.5-1.84-1.5L9 21z" />
      <path d="M14.5 9v6M11.5 12h6" />
      <path d="M2 8h4M3 12h3M2 16h4" />
    </Icon>
  )
}

/** Чек с галочкой: платёж. */
export function PayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5z" />
      <path d="M9 11l2 2 4-4" />
    </Icon>
  )
}

/** Ползунки с рваной кромкой: настройки. */
export function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 6h9M18 6h3M3 12h3M12 12h9M3 18l2-1.2 2 1.2 2-1.2 2 1.2 2-1.2L15 18M21 18h0" />
      <circle cx="15" cy="6" r="2.4" />
      <circle cx="9" cy="12" r="2.4" />
      <circle cx="18" cy="18" r="2.4" />
    </Icon>
  )
}
