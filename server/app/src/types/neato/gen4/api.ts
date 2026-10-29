import type { ScheduledCommands } from "./schedule";
import type { ErrorEvent, FullRobotState } from "./state";


// http_return_codes.py
export enum RobotHttpCode {
    OK = 200,
    CREATED = 201,
    BAD_REQUEST = 400,
    UNAUTHORIZED = 401,
    METHOD_NOT_ALLOWED = 405,
    NOT_FOUND = 404,
    NOT_ACCEPTABLE = 406,
    TIMEOUT = 408,
    CONFLICT = 409,
    GONE = 410,
    UNPROCESSABLE_ENTRY = 422,
    INTERNAL_SERVER_ERROR = 500,
    NOT_IMPLEMENTED = 501,
    SERVICE_UNAVAILABLE = 503,
}

export interface BaseResponse<T extends {}> {
    type: "response";
    id: string; // uuid
    code: RobotHttpCode;
    body: T;
}

export type GetRobotStateResponse = BaseResponse<FullRobotState>;
export type GetRobotScheduleResponse = BaseResponse<ScheduledCommands>

export enum OrbitalServices {
    PEER_STATE = "peer.state",
    
    MAPS_CREATE = "maps.create",
    
    ROBOTS_LINK = "robots.link",
    ROBOTS_NOTIFY = "robots.notify",
    ROBOTS_ERROR_CODES = "robots.error_codes",
    
    FIRMWARE_CHECK = "firmware.check",

    LOGS_LIST_FILES = "logs.list_files",
    LOGS_UPDATE_STATUS = "logs.update_status",
}

export interface BaseEvent<T extends {}, Service extends OrbitalServices> {
    type: "event";
    id: string; // uuid
    to: { service: Service }
    body: T;
}

export type PeerStateEvent = BaseEvent<FullRobotState, OrbitalServices.PEER_STATE>;
export type ErrorCodesEvent = BaseEvent<ErrorEvent, OrbitalServices.ROBOTS_ERROR_CODES>;
export type AnyEvent = PeerStateEvent | ErrorCodesEvent