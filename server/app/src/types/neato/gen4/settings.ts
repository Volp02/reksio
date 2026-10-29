

// Settings on the robot - later on there will be settings for vacuula server


// settings.cleaning_options
export enum SettingsCleaningOptionsOperation {
  GET = "settings.cleaning_options",
  SET = "settings.set_cleaning_options"
}

export interface SettingsCleaningOptions {
  force_floorplan: boolean
}




// settings.robot_language
export enum SettingsRobotLanguageOperation {
  GET = "settings.robot_language",
  SET = "settings.set_robot_language"
}

export interface SettingsRobotLanguage {
  language: SupportedLanguages
  available_languages: SupportedLanguages[]
}

export enum SupportedLanguages {
  EN = "en",
  EN_GB = "en-gb",
  DE = "de",
  ES = "es",
  FR_CA = "fr-ca",
  FR_FR = "fr-fr",
  IT = "it",
  JA = "ja",
  NL = "nl",
  PT_PT = "pt-pt",
  SV = "sv",
  ZH_HANS = "zh-hans",
  ZH_HANT = "zh-hant"
}


// Fix settings

export type SettingsMap = {
  [SettingsCleaningOptionsOperation.GET]: SettingsCleaningOptions
  [SettingsCleaningOptionsOperation.SET]: SettingsCleaningOptions
  [SettingsRobotLanguageOperation.GET]: SettingsRobotLanguage
  [SettingsRobotLanguageOperation.SET]: SettingsRobotLanguage
}

export type SettingsGetOperation =
  | SettingsCleaningOptionsOperation.GET
  | SettingsRobotLanguageOperation.GET

export type SettingsSetOperation =
  | SettingsCleaningOptionsOperation.SET
  | SettingsRobotLanguageOperation.SET

export interface RobotSettingsGet<Op extends SettingsGetOperation = SettingsGetOperation> {
  operation: Op
}

export interface RobotSettingsSet<Op extends SettingsSetOperation = SettingsSetOperation> {
  operation: Op
  values: SettingsMap[Op]
}

export type RobotSettings = RobotSettingsGet | RobotSettingsSet