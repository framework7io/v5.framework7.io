
import * as React from 'react';

  import { Framework7Parameters } from 'framework7/types';


interface AppProps extends Framework7Parameters {
  slot?: string;
  className?: string;
  style?: React.CSSProperties;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const App: React.FunctionComponent<AppProps>;

export default App;
  