import BluebirdPromise from 'bluebird';
import { config, logging } from '@hikari-systems/hs.utils';

const log = logging('tasks');
const { configFloat } = config;

// const loops = configInteger(`tasks:default:loops`, 0);
// const delayMedian = configFloat(`tasks:default:delayMedian`, 60.0);
// const delayVariance = configFloat(`tasks:default:delayVariance`, 0.0);

const startDelay = configFloat(`tasks:startDelay`, 5.0);
log.debug(`Background tasks starting in ${startDelay} seconds`);

BluebirdPromise.delay(startDelay * 1000).then(() =>
  Promise.all([
    // doLoopedTaskRun(
    //   KEY_1,
    //   () => Promise.resolve(true),
    //   task,
    //   configInteger(`tasks:${KEY_1}:loops`, loops),
    //   configFloat(`tasks:${KEY_1}:delayMedian`, delayMedian),
    //   configFloat(`tasks:${KEY_1}:delayVariance`, delayVariance),
    // ),
  ]),
);
