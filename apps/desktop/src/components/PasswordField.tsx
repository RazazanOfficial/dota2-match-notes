import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { Messages } from "../i18n";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { t: Messages };
export function PasswordField({ t, className, ...props }: Props) {
    const [visible, setVisible] = useState(false);
    return <span className={`password-field ${className || ""}`}><input {...props} type={visible ? "text" : "password"}/><button type="button" className="password-visibility" aria-label={visible ? t.hidePassword : t.showPassword} aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span>;
}
