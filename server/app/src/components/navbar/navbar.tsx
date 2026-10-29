import styles from './navbar.module.scss'
import { NavLink } from 'react-router';
import { IoMapOutline, IoHomeOutline, IoCogOutline, IoBarChartOutline, IoCalendarOutline } from "react-icons/io5";

export default () => {

    return (
        <div className={styles.navbar}>
            <Link to="/runs">
                <IoBarChartOutline size={30} />
            </Link>
            <Link to="/map">
                <IoMapOutline size={30} />
            </Link>
            <Link to="/">
                <IoHomeOutline size={30} />
            </Link>
            <Link to="/schedule">
                <IoCalendarOutline size={30} />
            </Link>
            <Link to="/settings">
                <IoCogOutline size={30} />
            </Link>
        </div>
    )

}


const Link = ({ to, children }: { to: string; children: React.ReactNode }) => (
    <NavLink to={to} className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}>
        {children}
        <span className={styles.dot} />
    </NavLink>
)
