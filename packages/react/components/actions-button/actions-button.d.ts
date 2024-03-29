
import * as React from 'react';


interface ActionsButtonProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  bold?: boolean;
  close?: boolean;
  onClick ?: (event?: any) => void;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const ActionsButton: React.FunctionComponent<ActionsButtonProps>;

export default ActionsButton;
  