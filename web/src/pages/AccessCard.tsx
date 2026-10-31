import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { auth, type AuthState } from '../api/client'
import { useI18n } from '../i18n'
import { Button, Card, Confirm, InputRow, Pill, Toast } from '../ui/ui'
import './pages.css'

const MIN_LENGTH = 8

/** Passwort für den Server setzen, ändern, entfernen; abmelden */
export function AccessCard() {
    const { t } = useI18n()
    const a = t.auth
    const [state, setState] = useState<AuthState>()
    const [password, setPassword] = useState('')
    const [repeat, setRepeat] = useState('')
    const [busy, setBusy] = useState(false)
    const [confirm, setConfirm] = useState(false)
    const [toast, setToast] = useState<string>()
    useEffect(() => { auth.state().then(setState).catch(() => undefined) }, [])

    const invalid = password.length > 0 && password.length < MIN_LENGTH ? a.tooShort
        : repeat.length > 0 && repeat !== password ? a.mismatch : undefined
    const run = async (fn: () => Promise<unknown>, done: string, next?: Partial<AuthState>) => {
        setBusy(true)
        try {
            await fn()
            setToast(done)
            setPassword('')
            setRepeat('')
            if (next) setState((s) => ({ enabled: false, authed: true, ...s, ...next }))
        } catch {
            setToast(t.actions.failed)
        } finally {
            setBusy(false)
        }
    }

    if (!state) return null
    return (
        <Card icon={<KeyRound />} title={a.title} aside={<Pill tone={state.enabled ? 'ok' : 'neutral'} label={state.enabled ? a.on : a.off} />}>
            <form className="zedit" onSubmit={(e) => {
                e.preventDefault()
                if (!invalid && password && repeat === password) run(() => auth.setPassword(password), a.saved, { enabled: true })
            }}>
                <InputRow label={a.newPassword} type="password" value={password} onChange={setPassword} autoComplete="new-password" invalid={!!invalid && password.length < MIN_LENGTH} />
                <InputRow label={a.repeat} type="password" value={repeat} onChange={setRepeat} autoComplete="new-password" invalid={invalid === a.mismatch} />
                {invalid && <p className="field-e" role="alert">{invalid}</p>}
                <div className="actions">
                    {state.enabled && <Button label={a.logout} variant="ghost" disabled={busy} onClick={() => run(auth.logout, a.logout).then(() => location.reload())} />}
                    {state.enabled && <Button label={a.disable} variant="danger" disabled={busy} onClick={() => setConfirm(true)} />}
                    <Button type="submit" variant="primary" label={state.enabled ? a.change : a.set} loading={busy}
                        disabled={!password || !!invalid || repeat !== password} />
                </div>
            </form>
            <Confirm open={confirm} title={a.disableConfirm} confirmLabel={a.disable} cancelLabel={t.common.cancel}
                onCancel={() => setConfirm(false)}
                onConfirm={() => { setConfirm(false); run(() => auth.setPassword(''), a.disabled, { enabled: false }) }} />
            <Toast text={toast} onClose={() => setToast(undefined)} />
        </Card>
    )
}
