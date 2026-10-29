import { useApp } from '../../context/useApp'
import Spinner from '../spinner/spinner'

export default function AppLoadingIndicator() {
    const { loadingState } = useApp()

    if (!loadingState?.isLoading) return null

    return <Spinner size="small" position="fixed" message={loadingState?.message} />
}
