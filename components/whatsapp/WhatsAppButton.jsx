import { MessageCircle } from "lucide-react";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

/**
 * WhatsAppButton — anchor that opens WhatsApp with a pre-filled message.
 * Props: { phone, message, label, variant }
 */
export default function WhatsAppButton({
  phone,
  message,
  label = "WhatsApp",
  variant = "outline",
  className,
}) {
  const href = buildWhatsAppLink(phone, message);

  const variants = {
    outline:
      "border border-hairline bg-canvas text-ink hover:bg-canvas-soft-2",
    solid: "bg-[#25D366] text-white hover:opacity-90",
    ghost: "text-cyan-deep hover:bg-canvas-soft-2",
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} via WhatsApp`}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-1.5 rounded-pill px-3 text-sm font-medium transition active:scale-[0.98]",
        variants[variant],
        className
      )}
    >
      <MessageCircle className="h-4 w-4" aria-hidden="true" />
      {label}
    </a>
  );
}
