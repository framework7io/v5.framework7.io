
import * as React from 'react';

import { LoginScreen } from 'framework7/types';


interface LoginScreenProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  opened?: boolean;
  animate?: boolean;
  containerEl ?: string | object;
  onLoginScreenOpen ?: (instance: LoginScreen.LoginScreen) => void;
  onLoginScreenOpened ?: (instance: LoginScreen.LoginScreen) => void;
  onLoginScreenClose ?: (instance: LoginScreen.LoginScreen) => void;
  onLoginScreenClosed ?: (instance: LoginScreen.LoginScreen) => void;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const LoginScreen: React.FunctionComponent<LoginScreenProps>;

export default LoginScreen;
  