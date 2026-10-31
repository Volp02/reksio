import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Bot } from 'lucide-react'
import { auth, HttpError, UNAUTHORIZED } from '../api/client'
import { useI18n } from '../i18n'
import { Button, Card, Empty, InputRow } from '../ui/ui'
import './shell.css'

/** Zeigt die App erst nach der Anmeldung, wenn auf dem Server ein Passwort gesetzt ist */
export function AuthGate({ children }: { children: ReactNode }) {
    const { t } = useI18n()
    const [state, setState] = useState<'checking' | 'login' | 'ok' | 'offline'>('checking')
    const check = () => auth.state()
        .then((s) => setState(s.enabled && !s.authed ? 'login' : 'ok'))
        .catch(() => setState('offline'))
    useEffect(() => {
        check()
        const on = () => setState('login')
        window.addEventListener(UNAUTHORIZED, on)
        return () => window.removeEventListener(UNAUTHORIZED, on)
    }, [])

    if (state === 'ok') return <>{children}</>
    // neu laden: Ereignisstrom und (in der App) Wächter starten mit der neuen Sitzung
    if (state === 'login') return <Login onDone={() => location.reload()} />
    return (
        <div className="login">
            <Card><Empty label={state === 'checking' ? t.common.loading : t.common.offline}
                action={state === 'offline' ? <Button size="s" label={t.common.retry} onClick={check} /> : undefined} /></Card>
        </div>
    )
}

function Login({ onDone }: { onDone: () => void }) {
    const { t } = useI18n()
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string>()
    const [busy, setBusy] = useState(false)
    const submit = async (e: FormEvent) => {
        e.preventDefault()
        if (!password) return
        setBusy(true)
        setError(undefined)
        try {
            await auth.login(password)
            onDone()
        } catch (err) {
            setError(err instanceof HttpError && err.status === 429 ? t.auth.throttled : t.auth.wrong)
        } finally {
            setBusy(false)
        }
    }
    return (
        <div className="login">
            <form className="login-f" onSubmit={submit}>
                <Card>
                    <div className="login-h"><span className="logo"><Bot /></span><h1 className="login-t">Reksio</h1></div>
                    <InputRow label={t.auth.password} type="password" value={password} onChange={setPassword}
                        autoComplete="current-password" autoFocus invalid={!!error} />
                    {error && <p className="login-e" role="alert">{error}</p>}
                    <div className="actions"><Button type="submit" variant="primary" label={t.auth.login} loading={busy} disabled={!password} /></div>
                </Card>
            </form>
        </div>
    )
}
