

// // Settings on the robot - later on there will be settings for vacuula server

export interface Preferences {
    robotSounds: boolean
    dirtbinAlertReminderInterval: number
    filterChangeReminderInterval: number
    brushChangeReminderInterval: number
}

// // settings.cleaning_options
// export enum SettingsCleaningOptionsOperation {
//   GET = "settings.cleaning_options",
//   SET = "settings.set_cleaning_options"
// }

// export interface SettingsCleaningOptions {
//   force_floorplan: boolean
// }


// // Fix settings

// export type SettingsMap = {
//   [SettingsCleaningOptionsOperation.GET]: SettingsCleaningOptions
//   [SettingsCleaningOptionsOperation.SET]: SettingsCleaningOptions
//   [SettingsRobotLanguageOperation.GET]: SettingsRobotLanguage
//   [SettingsRobotLanguageOperation.SET]: SettingsRobotLanguage
// }

// export type SettingsGetOperation =
//   | SettingsCleaningOptionsOperation.GET
//   | SettingsRobotLanguageOperation.GET

// export type SettingsSetOperation =
//   | SettingsCleaningOptionsOperation.SET
//   | SettingsRobotLanguageOperation.SET

// export interface RobotSettingsGet<Op extends SettingsGetOperation = SettingsGetOperation> {
//   operation: Op
// }

// export interface RobotSettingsSet<Op extends SettingsSetOperation = SettingsSetOperation> {
//   operation: Op
//   values: SettingsMap[Op]
// }

// export type RobotSettings = RobotSettingsGet | RobotSettingsSet