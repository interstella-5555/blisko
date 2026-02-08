import { TextStyle } from 'react-native';

export const colors = {
  ink: '#1A1A1A',
  bg: '#FAF7F2',
  accent: '#C0392B',
  rule: '#D5D0C4',
  muted: '#8B8680',
  mapBg: '#F0ECE3',
  status: {
    success: { text: '#5B7A5E', bg: '#EEF2EE' },
    warning: { text: '#B8863E', bg: '#F5F0E6' },
    error: { text: '#9B3B3B', bg: '#F2EEEE' },
  },
};

export const spacing = {
  hairline: 4,
  tick: 6,
  tight: 8,
  compact: 10,
  gutter: 12,
  column: 16,
  section: 24,
  block: 32,
};

export const fonts = {
  serif: 'InstrumentSerif-Regular',
  serifItalic: 'InstrumentSerif-Italic',
  sans: 'DMSans-Regular',
  sansMedium: 'DMSans-Medium',
  sansSemiBold: 'DMSans-SemiBold',
};

export const type = {
  display: {
    fontFamily: fonts.serif,
    fontSize: 28,
    letterSpacing: 2,
    color: colors.ink,
  } as TextStyle,
  heading: {
    fontFamily: fonts.serif,
    fontSize: 22,
    color: colors.ink,
  } as TextStyle,
  name: {
    fontFamily: fonts.serif,
    fontSize: 15,
    color: colors.ink,
  } as TextStyle,
  nameItalic: {
    fontFamily: fonts.serifItalic,
    fontSize: 15,
    color: colors.ink,
  } as TextStyle,
  body: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
  } as TextStyle,
  label: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.muted,
  } as TextStyle,
  button: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  } as TextStyle,
  caption: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
  } as TextStyle,
  tabLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 8,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  } as TextStyle,
};
