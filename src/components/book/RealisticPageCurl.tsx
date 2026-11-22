import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { Canvas, ImageShader, Vertices } from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
import { buildPageCurlMesh } from '@/utils/pageTurn';

type Props = {
  image: SkImage;
  width: number;
  height: number;
  progress: SharedValue<number>;
  direction: SharedValue<-1 | 1>;
  touchY: SharedValue<number>;
  paperColor: string;
};

/** Textures the live native page snapshot onto a curved, shaded Skia mesh. */
export function RealisticPageCurl({ image, width, height, progress, direction, touchY, paperColor }: Props) {
  const mesh = useDerivedValue(() => buildPageCurlMesh(width, height, progress.value, direction.value, touchY.value, paperColor));
  const points = useDerivedValue(() => mesh.value.points);
  const textures = useDerivedValue(() => mesh.value.textures);
  const frontColors = useDerivedValue(() => mesh.value.frontColors);
  const backColors = useDerivedValue(() => mesh.value.backColors);
  const frontIndices = useDerivedValue(() => mesh.value.frontIndices);
  const backIndices = useDerivedValue(() => mesh.value.backIndices);
  return <Canvas pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height }}>
    <Vertices vertices={points} textures={textures} colors={frontColors} indices={frontIndices} mode="triangles">
      <ImageShader image={image} tx="clamp" ty="clamp" fit="fill" rect={{ x: 0, y: 0, width, height }} />
    </Vertices>
    <Vertices vertices={points} colors={backColors} indices={backIndices} mode="triangles" />
  </Canvas>;
}
