
import * as React from 'react';

import { SwiperOptions } from 'swiper';


interface TabsProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  animated ?: boolean;
  swipeable ?: boolean;
  routable ?: boolean;
  swiperParams ?: SwiperOptions;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const Tabs: React.FunctionComponent<TabsProps>;

export default Tabs;
  