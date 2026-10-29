import { RobotState } from "./state";


export const RobotStateStrings = {
    [RobotState.INVALID as RobotState]: "Invalid",
    [RobotState.IDLE as RobotState]: "Idle",
    [RobotState.BUSY as RobotState]: "Busy",
    [RobotState.PAUSED as RobotState]: "Paused",
    [RobotState.ERROR as RobotState]: "Error",
} as const;

