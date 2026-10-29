import type { JSX } from 'react'
import styles from './button.module.scss'


interface BaseInputProps {
    text: string,
    onClick?: () => void,
    style: 'primary' | 'secondary' | 'success' | 'fail'
    disabled?: boolean
    icon?: JSX.Element
}

type ButtonProps= BaseInputProps


export default (prop: ButtonProps) => {

    return (
        <button className={`${styles.button} ${styles[prop.style]}`} disabled={prop.disabled} onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            prop.onClick?.()
        }}>
            {prop.icon}
            <span>{prop.text}</span>
        </button>
    )

}

