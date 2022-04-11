
import * as React from 'react';


interface GaugeProps {
  slot?: string;
  id?: string | number;
  className?: string;
  style?: React.CSSProperties;
  type ?: string;
  value ?: number | string;
  size ?: number | string;
  bgColor ?: string;
  borderBgColor ?: string;
  borderColor ?: string;
  borderWidth ?: number | string;
  valueText ?: number | string;
  valueTextColor ?: string;
  valueFontSize ?: number | string;
  valueFontWeight ?: number | string;
  labelText ?: string;
  labelTextColor ?: string;
  labelFontSize ?: number | string;
  labelFontWeight ?: number | string;
  color?: string;
  colorTheme?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  rippleColor?: string;
  themeDark?: boolean;
}
declare const Gauge: React.FunctionComponent<GaugeProps>;

export default Gauge;
  