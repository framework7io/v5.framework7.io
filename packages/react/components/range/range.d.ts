
import * as React from 'react';


interface RangeProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  init ?: boolean;
  value ?: number | Array<any> | string;
  min ?: number | string;
  max ?: number | string;
  step ?: number | string;
  label ?: boolean;
  dual ?: boolean;
  vertical ?: boolean;
  verticalReversed ?: boolean;
  draggableBar ?: boolean;
  formatLabel ?: Function;
  scale ?: boolean;
  scaleSteps ?: number;
  scaleSubSteps ?: number;
  formatScaleLabel ?: Function;
  limitKnobPosition ?: boolean;
  name ?: string;
  input ?: boolean;
  inputId ?: string;
  disabled ?: boolean;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
  onRangeChange ?: (val?: any) => void;
  onRangeChanged ?: (val?: any) => void;
}
declare const Range: React.FunctionComponent<RangeProps>;

export default Range;
  