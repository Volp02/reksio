import { useTranslation } from 'react-i18next'
import EmptyState from './emptyState'

export default function NoRobotsLinked() {
    const { t } = useTranslation()
    return <EmptyState title={t('require.noRobotsLinked')} subtitle={t('require.noRobotsLinkedInfo')} />
}
