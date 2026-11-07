import { useEffect, useState } from 'react'
import { Check, Compass, Plus, Trash2, X } from 'lucide-react'
import { api, gen3 } from '../api/client'
import { robot } from '../api/robot'
import { runTs, sortRuns, useRuns } from '../state/data'
import { fmtNumber, fmtWhen } from '../format'
import type { PersistentMap } from '../api/types'
import { fill, useI18n } from '../i18n'
import { useStore } from '../state/store'
import { Button, Confirm, Empty, IconButton, InputRow, Label, Pill, Switch } from '../ui/ui'

interface Draft { id: string; name: string; enabled: boolean }

/** Karten: anzeigen, umbenennen, verwenden, löschen und neue erkunden */
export function MapsPanel({ maps, current, onChoose, onChanged, onToast }: {
    maps: PersistentMap[]
    current?: string
    onChoose: (id: string | undefined) => void
    onChanged: () => void
    onToast: (text: string) => void
}) {
    const { t, locale } = useI18n()
    const s = useStore()
    const [draft, setDraft] = useState<Draft>()
    const [busy, setBusy] = useState<'save' | 'delete' | 'explore' | 'add'>()
    // Gen4: jede Reinigung bringt eine Bodenkarte mit, die sich übernehmen lässt
    const explorable = robot.canExplore(s.serial)
    const runs = useRuns(explorable ? undefined : s.serial)
    const candidates = sortRuns(runs.data).filter((r) => !maps.some((m) => m.id === r.id)).slice(0, 5)
    const [confirm, setConfirm] = useState<'delete' | 'explore'>()

    // gelöschte Karte: Bearbeitung schließen
    useEffect(() => { setDraft((d) => (d && maps.some((m) => m.id === d.id) ? d : undefined)) }, [maps])

    const created = (m: PersistentMap) => {
        const d = new Date(m.created ?? m.id)
        return isNaN(d.getTime()) ? m.id : fill(t.maps.created, { date: d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) })
    }

    const open = (m: PersistentMap) => {
        onChoose(m.id)
        setDraft({ id: m.id, name: m.name === '(unnamed)' ? '' : m.name, enabled: m.enabled })
    }

    const save = async () => {
        if (!draft || !s.serial) return
        setBusy('save')
        try {
            const map = maps.find((m) => m.id === draft.id)
            if (!map) return
            await robot.updateMap(s.serial, map, draft.name.trim() || t.maps.unnamed, draft.enabled)
            onChanged()
            setDraft(undefined)
            onToast(t.zones.saved)
        } catch {
            onToast(t.zones.saveFailed)
        } finally {
            setBusy(undefined)
        }
    }

    const remove = async () => {
        setConfirm(undefined)
        if (!draft || !s.serial) return
        setBusy('delete')
        try {
            await api.deleteMap(s.serial, draft.id)
            if (current === draft.id) onChoose(undefined)
            setDraft(undefined)
            onChanged()
            onToast(t.maps.deleted)
        } catch {
            onToast(t.actions.failed)
        } finally {
            setBusy(undefined)
        }
    }

    const explore = async () => {
        setConfirm(undefined)
        if (!s.serial) return
        setBusy('explore')
        try {
            await gen3.explore(s.serial)
            onToast(t.maps.exploring)
            await s.refreshRobot()
        } catch {
            onToast(t.actions.failed)
        } finally {
            setBusy(undefined)
        }
    }

    const add = async (id: string) => {
        if (!s.serial) return
        setBusy('add')
        try {
            await robot.useMap(s.serial, id)
            onChanged()
            onToast(t.maps.added)
        } catch {
            onToast(t.actions.failed)
        } finally {
            setBusy(undefined)
        }
    }

    const docked = !!s.robot?.details?.isDocked
    const canExplore = s.connected && docked && !!s.robot?.availableCommands?.start
    const name = (m: PersistentMap) => (m.name && m.name !== '(unnamed)' ? m.name : t.maps.unnamed)
    const editing = draft && maps.find((m) => m.id === draft.id)

    return (<>
        {editing ? (
            <div className="zedit">
                <div className="zedit-h">
                    <Label className="zedit-t">{name(editing)}</Label>
                    <IconButton size="s" icon={<X />} label={t.common.cancel} onClick={() => setDraft(undefined)} />
                </div>
                <InputRow label={t.zones.name} value={draft.name} placeholder={t.maps.unnamed}
                    onChange={(v) => setDraft({ ...draft, name: v.slice(0, 40) })} />
                <Switch label={t.maps.inUse} checked={draft.enabled} onChange={(v) => setDraft({ ...draft, enabled: v })} />
                <div className="actions">
                    <Button variant="danger" icon={<Trash2 />} label={t.maps.delete} disabled={!!busy}
                        loading={busy === 'delete'} onClick={() => setConfirm('delete')} />
                    <Button variant="primary" label={busy === 'save' ? t.actions.sending : t.common.save} loading={busy === 'save'}
                        disabled={!!busy} onClick={save} />
                </div>
            </div>
        ) : (<>
            {maps.length ? (
                <ul className="rows">
                    {maps.map((m) => (
                        <li key={m.id}>
                            <button type="button" className="row zrow" aria-current={m.id === current || undefined} onClick={() => open(m)}>
                                <span className="row-main">
                                    <Label className="row-t">{name(m)}</Label>
                                    <Label className="row-s">{created(m)}</Label>
                                </span>
                                {m.enabled && <Pill tone="ok" label={t.maps.inUse} />}
                                {m.id === current && <Check className="row-i zrow-ok" />}
                            </button>
                        </li>
                    ))}
                </ul>
            ) : <Empty label={t.map.noMap} />}
            {!explorable && candidates.length > 0 && (<>
                <Label className="zpanel-sub">{t.maps.fromRun}</Label>
                <ul className="rows">
                    {candidates.map((r) => {
                        const ts = runTs(r)
                        const area = r.run?.cleaned_area
                        return (
                            <li key={r.id}>
                                <div className="row zrow">
                                    <span className="row-main">
                                        <Label className="row-t">{ts ? fmtWhen(locale, s.server?.timezone, ts, s.now, t.overview, true) : r.id}</Label>
                                        {area ? <Label className="row-s">{`${fmtNumber(locale, area, 1)} m²`}</Label> : null}
                                    </span>
                                    <Button size="s" icon={<Plus />} label={t.maps.add} disabled={!!busy} loading={busy === 'add'} onClick={() => add(r.id)} />
                                </div>
                            </li>
                        )
                    })}
                </ul>
            </>)}
            {explorable && <div className="actions zpanel-foot">
                <Button icon={<Compass />} label={busy === 'explore' ? t.actions.sending : t.maps.explore} loading={busy === 'explore'}
                    title={canExplore ? undefined : t.maps.exploreDock} disabled={!canExplore || !!busy} onClick={() => setConfirm('explore')} />
            </div>}
        </>)}
        <Confirm open={confirm === 'delete'} title={fill(t.maps.deleteConfirm, { name: editing ? name(editing) : '' })}
            confirmLabel={t.maps.delete} cancelLabel={t.common.cancel} onCancel={() => setConfirm(undefined)} onConfirm={remove} />
        <Confirm open={confirm === 'explore'} title={t.maps.exploreConfirm} tone="primary"
            confirmLabel={t.maps.exploreStart} cancelLabel={t.common.cancel} onCancel={() => setConfirm(undefined)} onConfirm={explore} />
    </>)
}
