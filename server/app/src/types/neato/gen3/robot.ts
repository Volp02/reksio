
import { biEnum } from '../../.helpers'

export const ServiceLevel = biEnum({
    MACRO1: 'macro-1',
    MINIMAL1: 'minimal-1',
    MINIMAL2: 'minimal-2',
    BASIC1: 'basic-1',
    BASICLCD1: 'basic-lcd-1',
    BASIC2: 'basic-2',
    BASIC3: 'basic-3',
    BASIC4: 'basic-4',
    ADVANCED1: 'advanced-1',
});
export type ServiceLevel = typeof ServiceLevel[keyof typeof ServiceLevel];

export const RobotModel = biEnum({
    BotVacConnected: 'BotVacConnected',
    BotVacD3Connected: 'BotVacD3Connected',
    BotVacD4Connected: 'BotVacD4Connected',
    BotVacD5Connected: 'BotVacD5Connected',
    BotVacD6Connected: 'BotVacD6Connected',
    BotVacD7Connected: 'BotVacD7Connected',
});
export type RobotModel = typeof RobotModel[keyof typeof RobotModel];
