
import * as React from 'react';

import { Stepper } from 'framework7/types';


interface StepperProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  init ?: boolean;
  value ?: number;
  min ?: number;
  max ?: number;
  step ?: number;
  formatValue ?: Function;
  name ?: string;
  inputId ?: string;
  input ?: boolean;
  inputType ?: string;
  inputReadonly ?: boolean;
  autorepeat ?: boolean;
  autorepeatDynamic ?: boolean;
  wraps ?: boolean;
  manualInputMode ?: boolean;
  decimalPoint ?: number;
  buttonsEndInputMode ?: boolean;
  disabled ?: boolean;
  buttonsOnly ?: boolean;
  round ?: boolean;
  roundMd ?: boolean;
  roundIos ?: boolean;
  roundAurora ?: boolean;
  fill ?: boolean;
  fillMd ?: boolean;
  fillIos ?: boolean;
  fillAurora ?: boolean;
  large ?: boolean;
  largeMd ?: boolean;
  largeIos ?: boolean;
  largeAurora ?: boolean;
  small ?: boolean;
  smallMd ?: boolean;
  smallIos ?: boolean;
  smallAurora ?: boolean;
  raised ?: boolean;
  raisedMd ?: boolean;
  raisedIos ?: boolean;
  raisedAurora ?: boolean;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
  onStepperChange ?: (newValue?: any) => void;
  onInput ?: (event?: any, stepper?: Stepper.Stepper) => void;
  onChange ?: (event?: any, stepper?: Stepper.Stepper) => void;
  onStepperMinusClick ?: (event?: any, stepper?: Stepper.Stepper) => void;
  onStepperPlusClick ?: (event?: any, stepper?: Stepper.Stepper) => void;
}
declare const Stepper: React.FunctionComponent<StepperProps>;

export default Stepper;
  